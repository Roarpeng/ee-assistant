"""Schematic IR — circuit-level intermediate representation.

Layered model (design doc 2026-10-03, §4.3):

    SchematicDocument
      pages: [SchematicPage]
        symbols: [SymbolInstance]   # placed IEC 60617 glyphs with pin anchors
        wires:   [Wire]             # orthogonal polylines tagged with nets
        cross_refs: [CrossRef]      # coil/contact usage index (netlist stage)

The IR deliberately separates electrical connectivity (nets + declared
pins) from geometry (positions + polyline points). Net ids are local to a
page — cross-page relations are expressed by device-tag cross references,
matching how real multi-page schematics work.

`validate_schematic_ir` mirrors the `validate_eplan_xml` contract:
(ok, reason) tuples, pure function, no I/O.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

IR_VERSION = 1
SNAP_EPS = 0.05  # mm — wire endpoints must land on pin anchors this closely


class PinRef(BaseModel):
    symbol_id: str
    pin: str


class SymbolInstance(BaseModel):
    id: str
    ref: str                      # IEC 81346 device tag, e.g. "-Q1"
    symbol_key: str               # symbols.py registry key
    pos: tuple[float, float]      # sheet mm, origin = symbol bbox top-left
    mirror: bool = False
    attrs: dict[str, str] = Field(default_factory=dict)
    bom_link: Optional[str] = None


class Wire(BaseModel):
    id: str
    net: str
    points: list[tuple[float, float]]
    pins: list[PinRef] = Field(default_factory=list)  # 0-2 electrically joined pins
    line_no: Optional[str] = None                     # netlist stage fills this


class CrossRef(BaseModel):
    kind: str                     # "coil" | "contact" | "terminal" | "safety"
    ref: str                      # device tag whose usage is indexed
    pages: list[str]              # page numbers where it appears
    detail: str = ""              # e.g. "线圈在第2页，触点: 3/5"


class SchematicPage(BaseModel):
    page_no: int
    kind: str                     # "power" | "control" | "io" | "title"
    title_zh: str
    symbols: list[SymbolInstance] = Field(default_factory=list)
    wires: list[Wire] = Field(default_factory=list)
    cross_refs: list[CrossRef] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class SchematicDocument(BaseModel):
    ir_version: int = IR_VERSION
    project_id: str = ""
    project_name: str = ""
    source_topology_version: int = 0
    standard: str = "IEC 60617 / GB/T 4728"
    sheet_format: str = "A3"
    pages: list[SchematicPage] = Field(default_factory=list)


class SchematicBuildError(ValueError):
    """Raised by builders when the produced IR fails validation."""


def _snap_ok(a: tuple[float, float], b: tuple[float, float]) -> bool:
    return abs(a[0] - b[0]) <= SNAP_EPS and abs(a[1] - b[1]) <= SNAP_EPS


def validate_schematic_ir(
    doc: SchematicDocument,
    *,
    require_line_no: bool = True,
) -> tuple[bool, str]:
    """Structural validation of a SchematicDocument.

    Checks (per design doc §4.3):
    1. At least one page; page_no strictly increasing.
    2. Symbol ids unique per page; refs non-empty.
    3. Wire-declared pins exist (symbol present + pin in the symbol's
       anchor table) and the wire geometry actually touches those anchors.
    4. Wires sharing a net form one connected group (via coincident
       endpoints or shared pins).
    5. On control pages every net carries a line_no (unless disabled).

    Returns (ok, reason).
    """
    from app.core.schematic.symbols import get_symbol

    if not doc.pages:
        return False, "document has no pages"

    last_no = 0
    for page in doc.pages:
        if page.page_no <= last_no:
            return False, f"page numbers must strictly increase (got {page.page_no} after {last_no})"
        last_no = page.page_no

        sym_by_id: dict[str, SymbolInstance] = {}
        for s in page.symbols:
            if s.id in sym_by_id:
                return False, f"page {page.page_no}: duplicate symbol id {s.id}"
            if not (s.ref or "").strip():
                return False, f"page {page.page_no}: symbol {s.id} missing ref"
            sym_by_id[s.id] = s

        # Wire endpoint anchor: first/last polyline point must coincide with
        # the declared pin's anchor point (when declared).
        pin_points: dict[str, tuple[float, float]] = {}
        for w in page.wires:
            if not w.points:
                return False, f"page {page.page_no}: wire {w.id} has no points"
            endpoints = (w.points[0], w.points[-1])
            for pr in w.pins:
                sym = sym_by_id.get(pr.symbol_id)
                if sym is None:
                    return False, f"page {page.page_no}: wire {w.id} references unknown symbol {pr.symbol_id}"
                anchor = get_symbol(sym.symbol_key)
                known = {p.name: (sym.pos[0] + p.dx, sym.pos[1] + p.dy) for p in anchor.pins}
                if pr.pin not in known:
                    return False, (
                        f"page {page.page_no}: symbol {sym.id} ({sym.symbol_key}) "
                        f"has no pin '{pr.pin}'"
                    )
                pt = known[pr.pin]
                pin_points[f"{pr.symbol_id}:{pr.pin}"] = pt
                if not (_snap_ok(pt, endpoints[0]) or _snap_ok(pt, endpoints[-1])):
                    return False, (
                        f"page {page.page_no}: wire {w.id} endpoint not on pin "
                        f"{pr.symbol_id}.{pr.pin}"
                    )

        # Per-net connectivity: union wires that share a declared pin or an
        # exactly-coincident endpoint; every wire in a net must be reachable.
        by_net: dict[str, list[Wire]] = {}
        for w in page.wires:
            by_net.setdefault(w.net, []).append(w)

        for net, ws in by_net.items():
            parent = list(range(len(ws)))

            def find(i: int) -> int:
                while parent[i] != i:
                    parent[i] = parent[parent[i]]
                    i = parent[i]
                return i

            def union(i: int, j: int) -> None:
                ri, rj = find(i), find(j)
                if ri != rj:
                    parent[rj] = ri

            pin_owner: dict[str, int] = {}
            point_owner: dict[tuple[float, float], int] = {}
            for i, w in enumerate(ws):
                for pr in w.pins:
                    key = f"{pr.symbol_id}:{pr.pin}"
                    if key in pin_owner:
                        union(i, pin_owner[key])
                    pin_owner[key] = i
                for pt in (w.points[0], w.points[-1]):
                    if pt in point_owner:
                        union(i, point_owner[pt])
                    point_owner[pt] = i

            groups = {find(i) for i in range(len(ws))}
            if len(groups) > 1:
                return False, (
                    f"page {page.page_no}: net {net} split into {len(groups)} "
                    f"disconnected wire groups"
                )

        if require_line_no and page.kind == "control":
            for w in page.wires:
                if w.line_no is None:
                    return False, f"page {page.page_no}: control net {w.net} has no line number"

    return True, "ok"
