"""Schematic builder — orchestration entry point.

`build_schematic(topology, bom, requirement, wiring_rows)` is the only
function callers need. It:

1. Normalizes inputs defensively (topology may be missing/empty — BOM
   categories then stand in as pseudo-nodes, mirroring the fallback
   philosophy of `_build_fallback_topology`).
2. Assigns stable IEC 81346 device tags once (`TagRegistry`) so the same
   device keeps its -Q1/-KM1 tag across power / control / io pages.
3. Fans out to the three deterministic page generators, renumbers pages
   (power → control → io), runs the netlist post-pass (net merge, line
   numbers, cross references) and validates the result.
4. Raises `SchematicBuildError` when validation fails — callers surface
   it as HTTP 422 / a graph-node warning, never as a silent empty doc.
"""
from __future__ import annotations

from app.core.schematic import netlist as netlist_mod
from app.core.schematic.control_circuit import build_control_pages
from app.core.schematic.ir import (
    SchematicBuildError,
    SchematicDocument,
    SchematicPage,
    validate_schematic_ir,
)
from app.core.schematic.io_circuit import build_io_pages
from app.core.schematic.power_circuit import build_power_pages

# topology type / BOM category → ref prefix (IEC 81346-ish, GB 惯用)
_TYPE_PREFIX = {
    "circuit_breaker": "QF",
    "fuse": "FU",
    "disconnect": "QS",
    "contactor": "KM",
    "relay": "KA",
    "safety_relay": "KF",
    "vfd": "U",
    "servo": "U",
    "motor": "M",
    "power": "U",
    "transformer": "T",
    "estop": "SB",
    "safety_door": "SG",
    "switch": "SB",
    "sensor": "SQ",
    "signal_light": "HL",
    "indicator_light": "HL",
    "plc": "A",
    "safety_plc": "A",
    "io": "A",
    "hmi": "HMI",
    "ipc": "HMI",
    "terminal": "X",
    "other": "Z",
}

# BOM category (KG canonical, underscore or space separated) → topology type
_CATEGORY_TO_TYPE = {
    "PLC_CPU": "plc", "SAFETY_PLC": "safety_plc", "POWER_SUPPLY": "power",
    "CIRCUIT_BREAKER": "circuit_breaker", "HMI": "hmi", "IPC": "ipc",
    "IO_MODULE": "io", "VFD": "vfd", "SERVO_DRIVE": "servo", "SERVO": "servo",
    "SWITCH": "switch", "CONTACTOR": "contactor", "RELAY": "relay",
    "SAFETY_RELAY": "safety_relay", "E_STOP": "estop", "ESTOP": "estop",
    "TRANSFORMER": "transformer", "FUSE": "fuse", "SENSOR": "sensor",
    "DISCONNECT": "disconnect", "COMMUNICATION_MODULE": "switch",
    "TERMINAL_BLOCK": "io", "SAFETY_DOOR": "safety_door",
    "SIGNAL_LIGHT": "signal_light", "INDICATOR_LIGHT": "indicator_light",
    "MOTOR": "motor", "THERMAL_OVERLOAD": "relay", "ACTUATOR": "relay",
    "POWER_DISTRIBUTION": "circuit_breaker", "MOTOR_CONTROL": "contactor",
}


def _category_to_type(category: str | None) -> str | None:
    key = (category or "").strip().upper().replace(" ", "_").replace("-", "_")
    if key in _CATEGORY_TO_TYPE:
        return _CATEGORY_TO_TYPE[key]
    for canon, topo in _CATEGORY_TO_TYPE.items():
        if key and (key in canon or canon in key):
            return topo
    return None


class TagRegistry:
    """Stable device-tag assignment shared by every page generator."""

    def __init__(self, nodes: list[dict]) -> None:
        self._by_node: dict[str, str] = {}
        self._counters: dict[str, int] = {}
        for n in nodes:
            nid = n.get("id")
            ntype = n.get("type") or "other"
            if nid:
                self.ref_for(nid, ntype)

    def _next(self, prefix: str) -> str:
        self._counters[prefix] = self._counters.get(prefix, 0) + 1
        return f"-{prefix}{self._counters[prefix]}"

    def ref_for(self, node_id: str, node_type: str) -> str:
        if node_id in self._by_node:
            return self._by_node[node_id]
        ref = self._next(_TYPE_PREFIX.get(node_type or "other", "Z"))
        self._by_node[node_id] = ref
        return ref

    def free_ref(self, node_type: str) -> str:
        """Synthesize a tag for a device that has no topology node."""
        return self._next(_TYPE_PREFIX.get(node_type or "other", "Z"))

    def resolve_hint(self, hint: str) -> str:
        """Map an LLM ref hint ('KM1'/'-KF1') onto a registered tag, or
        allocate a fresh KA tag when nothing matches."""
        h = (hint or "").strip().lstrip("-").upper()
        if h:
            for ref in self._by_node.values():
                if ref.lstrip("-").upper() == h:
                    return ref
        if h and h[:2] in ("KM", "KA", "KF", "SB", "SQ", "HL"):
            # unknown but well-formed: allocate next number under that family
            prefix = h[:2]
            return self._next(prefix)
        return self._next("KA")

    def plc_ref(self) -> str:
        a_refs = [r for r in self._by_node.values() if r.startswith("-A")]
        if a_refs:
            return sorted(a_refs)[0]
        return self._next("A")


def build_schematic(
    topology: dict | None,
    bom: list[dict] | None,
    requirement: dict | None = None,
    wiring_rows: list[dict] | None = None,
    *,
    project_id: str = "",
    topology_version: int = 0,
    extra_rungs: list[dict] | None = None,
) -> SchematicDocument:
    requirement = requirement if isinstance(requirement, dict) else {}
    nodes, edges = _extract_graph(topology)
    if not nodes:
        nodes = _pseudo_nodes_from_bom(bom)
        edges = []

    tags = TagRegistry(nodes)
    pages: list[SchematicPage] = []
    pages.extend(build_power_pages(nodes, edges, tags))
    pages.extend(build_control_pages(nodes, tags, requirement, extra_rungs=extra_rungs))
    pages.extend(build_io_pages(wiring_rows or [], tags, requirement))

    if not pages:
        pages.append(SchematicPage(
            page_no=1, kind="title", title_zh="原理图（无内容）",
            notes=["拓扑与 BOM 中均无可绘制的电气内容，未生成回路页。"],
        ))

    for i, p in enumerate(pages, start=1):
        p.page_no = i

    doc = SchematicDocument(
        project_id=project_id,
        source_topology_version=topology_version,
        pages=pages,
    )
    netlist_mod.annotate(doc)

    ok, reason = validate_schematic_ir(doc)
    if not ok:
        raise SchematicBuildError(reason)
    return doc


def _extract_graph(topology: dict | None) -> tuple[list[dict], list[dict]]:
    if not isinstance(topology, dict):
        return [], []
    nodes = [n for n in (topology.get("nodes") or []) if isinstance(n, dict) and n.get("id")]
    edges = [e for e in (topology.get("edges") or []) if isinstance(e, dict)]
    return nodes, edges


def _pseudo_nodes_from_bom(bom: list[dict] | None) -> list[dict]:
    """BOM-only fallback: turn categories into bare topology-style nodes."""
    nodes: list[dict] = []
    seen: dict[str, int] = {}
    for item in bom or []:
        if not isinstance(item, dict):
            continue
        ntype = _category_to_type(item.get("category"))
        if not ntype:
            continue
        seen[ntype] = seen.get(ntype, 0) + 1
        label = f"{item.get('manufacturer', '')} {item.get('model', '')}".strip()
        nodes.append({
            "id": f"bom_{ntype}_{seen[ntype]}",
            "type": ntype,
            "label": label[:60] or ntype,
            "bom_id": str(item.get("id") or ""),
        })
    return nodes
