"""Main (power) circuit page generator — deterministic.

Derives 3-phase feed branches from the confirmed topology:

    L1/L2/L3 bus bars (horizontal, page top)
        └─ branch: protection (QF/FU/QS) → execution (KM main / VFD box) → motor

Branch discovery walks `category == power`-classified edges upstream from
execution nodes; when the topology carries no usable edges the generators
degrade to round-robin pairing (breakers list × execution list), and when
no breaker exists at all a default main breaker is synthesized with a
page note (real cabinets always have one).
"""
from __future__ import annotations

from app.core.schematic.ir import PinRef, SchematicPage, SymbolInstance, Wire
from app.core.schematic.symbols import get_symbol, pin_point

MAX_BRANCHES_PER_PAGE = 6
MAX_MOTORS_PER_PAGE = MAX_BRANCHES_PER_PAGE

BUS_YS = {"L1": 42.0, "L2": 48.0, "L3": 54.0}
BUS_X0, BUS_X1 = 30.0, 400.0
BRANCH_X0, BRANCH_PITCH = 52.0, 58.0

QF_TOP_Y = 64.0            # protection symbol pos y
SECOND_Y = 94.0            # execution symbol pos y
MOTOR_Y = 150.0

_PROTECTION = {"circuit_breaker": "QF_3P", "fuse": "FU", "disconnect": "QS_3P"}
_EXECUTION = {"contactor": "KM_MAIN_3P", "relay": "KM_MAIN_3P", "vfd": "VFD_BOX", "servo": "SERVO_BOX"}


def _power_like(protocol: str | None) -> bool:
    p = (protocol or "").upper()
    return any(k in p for k in ("POWER", "VOLT", "220V", "230V", "380V", "400V", "480V", "24V", "MAINS", "AC"))


def _upstream(exec_id: str, edges: list[dict]) -> str | None:
    """Nearest upstream neighbour over power-classified edges."""
    for e in edges:
        if e.get("target") == exec_id and _power_like(e.get("protocol")):
            return e.get("source")
    for e in edges:
        if e.get("source") == exec_id and _power_like(e.get("protocol")):
            return e.get("target")
    return None


def _downstream(exec_id: str, edges: list[dict]) -> str | None:
    for e in edges:
        if e.get("source") == exec_id and _power_like(e.get("protocol")):
            return e.get("target")
    for e in edges:
        if e.get("target") == exec_id and _power_like(e.get("protocol")):
            return e.get("source")
    return None


class _Ids:
    def __init__(self) -> None:
        self.n = 0

    def sym(self) -> str:
        self.n += 1
        return f"pw_s{self.n}"

    def wire(self) -> str:
        self.n += 1
        return f"pw_w{self.n}"


def build_power_pages(
    nodes: list[dict],
    edges: list[dict],
    tags,  # builder.TagRegistry
) -> list[SchematicPage]:
    node_by_id = {n.get("id"): n for n in nodes if isinstance(n, dict) and n.get("id")}

    protections = [n for n in nodes if n.get("type") in _PROTECTION]
    executions = [n for n in nodes if n.get("type") in _EXECUTION]
    motors = [n for n in nodes if n.get("type") == "motor"]
    notes: list[str] = []

    if not executions:
        notes.append("拓扑中未发现执行设备（接触器/变频器/伺服），主回路页省略。")
        return []

    branches: list[dict] = []
    used_protection: set[str] = set()
    used_motor: set[str] = set()
    for exe in executions:
        prot_id = _upstream(exe["id"], edges)
        prot = node_by_id.get(prot_id)
        if not prot or prot.get("type") not in _PROTECTION:
            # round-robin an unused breaker
            prot = next((p for p in protections if p["id"] not in used_protection), None)
        if prot:
            used_protection.add(prot["id"])

        motor_id = _downstream(exe["id"], edges)
        motor = node_by_id.get(motor_id)
        if not motor or motor.get("type") != "motor":
            motor = next((m for m in motors if m["id"] not in used_motor), None)
        if motor:
            used_motor.add(motor["id"])

        branches.append({"exe": exe, "prot": prot, "motor": motor})

    if not protections and not any(b["prot"] for b in branches):
        notes.append("未在拓扑中发现保护电器，主断路器 -Q1 按规范默认添加。")

    orphan_motors = [m for m in motors if m["id"] not in used_motor]
    for m in orphan_motors:
        # Attach motors that no branch consumed as bare branches.
        branches.append({"exe": None, "prot": None, "motor": m})
    if orphan_motors:
        notes.append(f"{len(orphan_motors)} 台电机未关联执行设备，单独绘制供电支路。")

    pages: list[SchematicPage] = []
    for i in range(0, len(branches), MAX_BRANCHES_PER_PAGE):
        chunk = branches[i:i + MAX_BRANCHES_PER_PAGE]
        pages.append(_render_power_page(chunk, tags, list(notes)))
        notes = []  # only the first page carries document-level notes
    return pages


def _render_power_page(chunk: list[dict], tags, notes: list[str]) -> SchematicPage:
    ids = _Ids()
    symbols: list[SymbolInstance] = []
    wires: list[Wire] = []

    taps: dict[str, list[float]] = {"L1": [], "L2": [], "L3": []}

    for bi, br in enumerate(chunk):
        bx = BRANCH_X0 + bi * BRANCH_PITCH

        # ── protection glyph ──
        prot_y = QF_TOP_Y
        prot_sym = None
        if br["prot"]:
            key = _PROTECTION[br["prot"]["type"]]
            ref = tags.ref_for(br["prot"]["id"], br["prot"]["type"])
            prot_sym = SymbolInstance(
                id=ids.sym(), ref=ref, symbol_key=key,
                pos=(bx, prot_y),
                attrs=_attrs_of(br["prot"]),
                bom_link=br["prot"].get("bom_id"),
            )
        else:
            prot_sym = SymbolInstance(
                id=ids.sym(), ref=tags.free_ref("circuit_breaker"), symbol_key="QF_3P",
                pos=(bx, prot_y), attrs={"note": "默认主断路器"},
            )
        symbols.append(prot_sym)

        # bus drops onto protection pole tops (pole top dx = 4/10/16)
        for phase, dx in (("L1", 4.0), ("L2", 10.0), ("L3", 16.0)):
            tap_x = round(bx + dx, 3)
            taps[phase].append(tap_x)
            start = (tap_x, BUS_YS[phase])
            end = pin_point(prot_sym.symbol_key, prot_sym.pos,
                            {"L1": "L1", "L2": "L2", "L3": "L3"}[phase])
            wires.append(Wire(
                id=ids.wire(), net=f"BUS_{phase}_{bi}",
                points=[start, (tap_x, end[1]), end],
                pins=[PinRef(symbol_id=prot_sym.id, pin=phase)],
            ))

        # ── execution glyph ──
        exe = br["exe"]
        exe_sym = None
        if exe:
            key = _EXECUTION[exe["type"]]
            ref = tags.ref_for(exe["id"], exe["type"])
            is_drive = exe["type"] in ("vfd", "servo")
            # KM top pins align with QF bottom pins (both offset by 5)
            exe_x = bx + (5.0 if not is_drive else 1.0)
            exe_sym = SymbolInstance(
                id=ids.sym(), ref=ref, symbol_key=key,
                pos=(exe_x, SECOND_Y),
                attrs=_attrs_of(exe), bom_link=exe.get("bom_id"),
            )
            symbols.append(exe_sym)
            bottom_pins = ("T1", "T2", "T3")
            in_pins = ("L1", "L2", "L3") if is_drive else ("L1", "L2", "L3")
            for k in range(3):
                src = pin_point(prot_sym.symbol_key, prot_sym.pos, bottom_pins[k])
                dst = pin_point(exe_sym.symbol_key, exe_sym.pos, in_pins[k])
                wires.append(Wire(
                    id=ids.wire(), net=f"BR_{bi}_{k}",
                    points=[src, (src[0], (src[1] + dst[1]) / 2), (dst[0], (src[1] + dst[1]) / 2), dst],
                    pins=[PinRef(symbol_id=prot_sym.id, pin=bottom_pins[k]),
                          PinRef(symbol_id=exe_sym.id, pin=in_pins[k])],
                ))

        # ── motor glyph ──
        motor = br["motor"]
        if motor:
            ref = tags.ref_for(motor["id"], motor["type"])
            m_sym = SymbolInstance(
                id=ids.sym(), ref=ref, symbol_key="M_3PH",
                pos=(bx + 7.0, MOTOR_Y),
                attrs=_attrs_of(motor), bom_link=motor.get("bom_id"),
            )
            symbols.append(m_sym)
            m_pins = ("U", "V", "W")
            if exe_sym:
                out_pins = ("U", "V", "W") if exe_sym.symbol_key in ("VFD_BOX", "SERVO_BOX") else ("T1", "T2", "T3")
                src_sym = exe_sym
            else:
                out_pins = ("T1", "T2", "T3")
                src_sym = prot_sym
            for k in range(3):
                src = pin_point(src_sym.symbol_key, src_sym.pos, out_pins[k])
                dst = pin_point("M_3PH", m_sym.pos, m_pins[k])
                wires.append(Wire(
                    id=ids.wire(), net=f"ML_{bi}_{k}",
                    points=[src, (src[0], (src[1] + dst[1]) / 2), (dst[0], (src[1] + dst[1]) / 2), dst],
                    pins=[PinRef(symbol_id=src_sym.id, pin=out_pins[k]),
                          PinRef(symbol_id=m_sym.id, pin=m_pins[k])],
                ))

    # ── phase bus bars as chained segments between taps ──
    for phase, ys in BUS_YS.items():
        xs = sorted(set(taps[phase]))
        pts = [BUS_X0, *xs, BUS_X1]
        for a, b in zip(pts, pts[1:]):
            wires.append(Wire(
                id=ids.wire(), net=f"BUS_{phase}",
                points=[(round(a, 3), ys), (round(b, 3), ys)],
            ))

    return SchematicPage(
        page_no=0,  # renumbered by builder
        kind="power",
        title_zh="主回路",
        symbols=symbols,
        wires=wires,
        notes=notes,
    )


def _attrs_of(node: dict) -> dict[str, str]:
    attrs: dict[str, str] = {}
    label = (node.get("label") or "").strip()
    if label:
        attrs["label"] = label[:48]
    for k in ("manufacturer", "model"):
        v = (node.get("details") or {}).get(k) if isinstance(node.get("details"), dict) else None
        if v:
            attrs[k] = str(v)[:40]
    return attrs
