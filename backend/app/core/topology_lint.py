"""Topology lint checks for electrical graph validity."""

from __future__ import annotations

from app.core.component_normalizer import normalize_topology_type


def lint_topology(snapshot: dict) -> list[dict]:
    nodes = snapshot.get("nodes", []) or []
    edges = snapshot.get("edges", []) or []

    violations: list[dict] = []
    node_ids = set()

    for n in nodes:
        nid = str(n.get("id", "")).strip()
        if not nid:
            violations.append({"severity": "error", "rule": "node_id", "message": "Empty node id"})
            continue
        if nid in node_ids:
            violations.append({"severity": "error", "rule": "node_id", "message": f"Duplicate node id: {nid}"})
        node_ids.add(nid)

    for e in edges:
        src = str(e.get("source", "")).strip()
        tgt = str(e.get("target", "")).strip()
        if src not in node_ids or tgt not in node_ids:
            violations.append({"severity": "error", "rule": "dangling_edge", "message": f"Dangling edge {e.get('id','')}: {src}->{tgt}"})
        if not str(e.get("protocol", "")).strip():
            violations.append({"severity": "error", "rule": "protocol_missing", "message": f"Edge {e.get('id','')} missing protocol"})

    norm_types = {normalize_topology_type(n.get("type")) for n in nodes}
    if "power" not in norm_types:
        violations.append({"severity": "warning", "rule": "power_chain", "message": "No power node found"})
    if "plc" not in norm_types:
        violations.append({"severity": "warning", "rule": "power_chain", "message": "No plc node found"})

    return violations
