"""Netlist engine: equipotential merge, line numbers, cross references.

Runs as a post-pass over pages produced by the circuit builders:

1. `merge_nets(page)` — union-find over wires that share a declared pin
   (or coincident endpoints), then rewrites net ids into stable "N<n>"
   form ordered by first appearance (top-left first). Wires that connect
   nothing are pruned.
2. `assign_line_numbers(page)` — control pages only. Every equipotential
   except the supply rails gets a sequential line number ("电位分段编号"):
   nets are ordered by the topmost-leftmost wire point, the left rail
   keeps "L" and the right/return rail keeps "N".
3. `build_cross_refs(pages)` — device-tag usage index: coils vs contacts
   vs terminals across all pages, attached back to every page.

Pure functions, deterministic ordering everywhere.
"""
from __future__ import annotations

from app.core.schematic.ir import SchematicDocument, SchematicPage, CrossRef

# Coil / contact categories from symbols.py registry (import lazily to keep
# this module free of geometry concerns beyond category names).
_COIL_CATEGORIES = {"coil"}
_CONTACT_CATEGORIES = {"contact_no", "contact_nc", "contactor_main", "breaker",
                       "fuse", "disconnect", "button", "estop", "safety_door"}
_SAFETY_CATEGORIES = {"safety_relay"}


def _find(parent: dict[str, str], x: str) -> str:
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


def _union(parent: dict[str, str], a: str, b: str) -> None:
    ra, rb = _find(parent, a), _find(parent, b)
    if ra != rb:
        # deterministic: lexicographically smaller root wins
        if ra < rb:
            parent[rb] = ra
        else:
            parent[ra] = rb


def _sort_key(w):
    pts = w.points or [(0.0, 0.0)]
    return (min(p[1] for p in pts), min(p[0] for p in pts), w.id)


def merge_nets(page: SchematicPage) -> SchematicPage:
    """Merge coincident/pin-sharing wires into unified nets, rewrite ids."""
    parent: dict[str, str] = {w.id: w.id for w in page.wires}

    pin_owner: dict[str, str] = {}
    point_owner: dict[tuple[float, float], str] = {}
    for w in page.wires:
        for pr in w.pins:
            key = f"{pr.symbol_id}:{pr.pin}"
            if key in pin_owner:
                _union(parent, w.id, pin_owner[key])
            pin_owner[key] = w.id
        for pt in (w.points[0], w.points[-1]):
            if pt in point_owner:
                _union(parent, w.id, point_owner[pt])
            point_owner[pt] = w.id

    # Root wire order (deterministic): sort members by top-left position.
    members: dict[str, list[str]] = {}
    for w in page.wires:
        members.setdefault(_find(parent, w.id), []).append(w.id)
    wire_by_id = {w.id: w for w in page.wires}
    root_order = sorted(members, key=lambda r: _sort_key(wire_by_id[members[r][0]]))

    root_to_net: dict[str, str] = {}
    for i, root in enumerate(root_order, start=1):
        root_to_net[root] = f"N{i}"

    kept: list = []
    for w in sorted(page.wires, key=lambda w: w.id):
        net = root_to_net[_find(parent, w.id)]
        w.net = net
        kept.append(w)
    page.wires = kept
    return page


def assign_line_numbers(page: SchematicPage, *, left_net: str = "L", right_net: str = "N") -> SchematicPage:
    """电位分段编号: sequential numbers for control/io equipotentials.

    Control pages: rails are exempt (leftmost/rightmost vertical wires
    keep "L" / "N"), numbers follow top-left → bottom-right order —
    which matches reading a ladder diagram rung by rung.
    IO pages: 4-digit field-wiring numbers (1001, 1002, ...) in row
    order, matching shop practice for terminal-side wiring.
    """
    if page.kind == "io":
        net_names = sorted({w.net for w in page.wires}, key=lambda n: _net_sort_key(page, n))
        for i, net in enumerate(net_names, start=1001):
            for w in page.wires:
                if w.net == net:
                    w.line_no = str(i)
        return page
    if page.kind != "control":
        return page

    # Detect rail nets: the leftmost vertical wire = supply rail (L),
    # the rightmost vertical wire = return rail (N).
    vertical = [w for w in page.wires if len(w.points) >= 2 and
                abs(w.points[0][0] - w.points[-1][0]) < 0.01 and
                abs(w.points[0][1] - w.points[-1][1]) > 5]
    rail_left = min((w.net for w in vertical), key=lambda n: _net_anchor_x(page, n), default=None)
    rail_right = max((w.net for w in vertical), key=lambda n: _net_anchor_x(page, n), default=None)

    net_names = sorted({w.net for w in page.wires}, key=lambda n: _net_sort_key(page, n))
    counter = 0
    for net in net_names:
        if net in (rail_left, rail_right):
            continue
        counter += 1
        for w in page.wires:
            if w.net == net:
                w.line_no = str(counter)
    # Rails get fixed labels so validation's "every control net numbered"
    # rule still passes for them.
    for w in page.wires:
        if w.net == rail_left:
            w.line_no = "L"
        elif w.net == rail_right:
            w.line_no = "N"
    return page


def _net_anchor_x(page: SchematicPage, net: str) -> float:
    xs = [p[0] for w in page.wires if w.net == net for p in w.points]
    return min(xs) if xs else 0.0


def _net_sort_key(page: SchematicPage, net: str):
    ys = [p[1] for w in page.wires if w.net == net for p in w.points]
    xs = [p[0] for w in page.wires if w.net == net for p in w.points]
    return (min(ys) if ys else 0.0, min(xs) if xs else 0.0, net)


def build_cross_refs(doc: SchematicDocument) -> SchematicDocument:
    """Index coil/contact/terminal usage per device tag across pages."""
    from app.core.schematic.symbols import get_symbol

    usage: dict[str, dict[str, set[int]]] = {}
    for page in doc.pages:
        for s in page.symbols:
            cat = get_symbol(s.symbol_key).category
            bucket = None
            if cat in _COIL_CATEGORIES:
                bucket = "coil"
            elif cat in _SAFETY_CATEGORIES:
                bucket = "safety"
            elif cat in _CONTACT_CATEGORIES:
                bucket = "contact"
            elif cat == "terminal":
                bucket = "terminal"
            if bucket:
                usage.setdefault(s.ref, {}).setdefault(bucket, set()).add(page.page_no)

    for page in doc.pages:
        refs = []
        for ref, buckets in sorted(usage.items()):
            if not any(p == page.page_no for pages in buckets.values() for p in pages):
                continue
            parts = []
            if "coil" in buckets:
                parts.append(f"线圈:{','.join(map(str, sorted(buckets['coil'])))}")
            if "contact" in buckets:
                parts.append(f"触点:{','.join(map(str, sorted(buckets['contact'])))}")
            if "safety" in buckets:
                parts.append("安全继电器本体")
            kind = "coil" if "coil" in buckets else ("safety" if "safety" in buckets else "contact")
            refs.append(CrossRef(kind=kind, ref=ref, pages=[str(p) for p in sorted(set().union(*buckets.values()))], detail="; ".join(parts)))
        page.cross_refs = refs
    return doc


def annotate(doc: SchematicDocument) -> SchematicDocument:
    """Full post-pass pipeline: merge → line numbers → cross references."""
    for page in doc.pages:
        merge_nets(page)
        assign_line_numbers(page)
    build_cross_refs(doc)
    return doc
