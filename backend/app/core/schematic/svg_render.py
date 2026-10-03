"""Server-side SVG rendering of Schematic IR pages.

A3 landscape (420x297mm) per IEC 61082: drawing frame, zone grid
(columns 1-8, rows A-F), title block bottom-right. Rendering is fully
deterministic — no timestamps, no random ids — so golden tests can
byte-compare output.

Wire line numbers print above the first segment; symbol refs print at the
symbol's label offset; io-page terminals print wire spec / channel labels
from symbol attrs. Cross-reference summaries print bottom-left.
"""
from __future__ import annotations

import html

from app.core.schematic.ir import SchematicDocument, SchematicPage
from app.core.schematic.symbols import dashed_path_indices, get_symbol

W, H = 420.0, 297.0
FRAME_INSET = 10.0
TITLE_X0, TITLE_Y0, TITLE_W, TITLE_H = 230.0, 262.0, 180.0, 25.0
CONTENT_Y1 = 258.0

_FONT = "ui-monospace,'JetBrains Mono',Consolas,monospace"
_STROKE = "#1a1a1a"

_KIND_BADGE = {
    "power": "主回路 MAIN CIRCUIT",
    "control": "控制回路 CONTROL CIRCUIT",
    "io": "端子与 IO 回路 TERMINAL / IO",
    "title": "封面 TITLE",
}


def render_page(page: SchematicPage, doc: SchematicDocument) -> str:
    parts: list[str] = []
    add = parts.append
    add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
        f'width="{W}mm" height="{H}mm" font-family="{_FONT}">')

    _frame(add, page, doc)
    _notes(add, page)
    _cross_refs(add, page)

    # ── wires (below symbols) ──
    for w in page.wires:
        pts = " ".join(f"{x:g},{y:g}" for x, y in w.points)
        add(f'<polyline points="{pts}" fill="none" stroke="{_STROKE}" stroke-width="0.4" '
            f'stroke-linejoin="round" data-wire="{html.escape(w.id)}" data-net="{html.escape(w.net)}"/>')
        if w.line_no and w.points:
            x, y = w.points[0]
            dx = 2.2 if page.kind != "io" else -0.5
            anchor = "start" if page.kind != "io" else "end"
            add(f'<text x="{x + dx:g}" y="{y - 1.1:g}" font-size="3" text-anchor="{anchor}" '
                f'fill="#0b5394">{html.escape(str(w.line_no))}</text>')

    # ── symbols ──
    for s in page.symbols:
        sym = get_symbol(s.symbol_key)
        dashed = set(dashed_path_indices(s.symbol_key))
        over = s.attrs.get("over") == "true"
        stroke = "#c62828" if over else _STROKE
        add(f'<g transform="translate({s.pos[0]:g},{s.pos[1]:g})" data-symbol="{html.escape(s.id)}" '
            f'data-ref="{html.escape(s.ref)}">'
            f'{"<title>" + html.escape(s.attrs.get("label") or s.ref) + "</title>"}')
        h_scale = 1.0
        if s.symbol_key == "PLC_IO_BOX":
            try:
                h_scale = float(s.attrs.get("height") or sym.height) / sym.height
            except ValueError:
                h_scale = 1.0
        for i, d in enumerate(sym.paths):
            dash = ' stroke-dasharray="2,1.2"' if i in dashed else ""
            if h_scale != 1.0:
                add(f'<g transform="scale(1,{h_scale:g})"><path d="{d}" fill="none" '
                    f'stroke="{stroke}" stroke-width="0.5"{dash}/></g>')
            else:
                add(f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="0.5"{dash}/>')
        for tx, ty, text in sym.texts:
            add(f'<text x="{tx:g}" y="{ty:g}" font-size="3.4" text-anchor="middle" '
                f'fill="{stroke}">{html.escape(text)}</text>')
        # ref + label beside the glyph
        ref_x, ref_y = sym.width + 1.5, sym.height * 0.5
        if s.symbol_key == "PLC_IO_BOX":
            ref_x, ref_y = 25.0, 10.0
        add(f'<text x="{ref_x:g}" y="{ref_y:g}" font-size="3.6" fill="#111">'
            f'{html.escape(s.ref)}</text>')
        label = s.attrs.get("label") or s.attrs.get("model") or ""
        if label:
            add(f'<text x="{ref_x:g}" y="{ref_y + 4.0:g}" font-size="2.6" fill="#555">'
                f'{html.escape(label[:40])}</text>')
        # io terminal annotations
        if s.symbol_key == "X_TERMINAL":
            ws = s.attrs.get("wire_spec") or ""
            ch = s.attrs.get("channel") or ""
            if ws:
                add(f'<text x="-1.5" y="-1.2" font-size="2.4" text-anchor="end" fill="#333">'
                    f'{html.escape(ws)}</text>')
            if ch:
                add(f'<text x="8" y="1.2" font-size="2.6" fill="#0b5394">{html.escape(ch)}</text>')
            if over:
                add('<text x="3" y="-3.2" font-size="3" text-anchor="middle" fill="#c62828">EXT</text>')
        add("</g>")

    _page_chrome(add, page)
    add("</svg>")
    return "\n".join(parts)


def render_document(doc: SchematicDocument) -> list[tuple[int, str]]:
    """[(page_no, svg)] for every page — deterministic order."""
    return [(p.page_no, render_page(p, doc)) for p in doc.pages]


# ── chrome ──────────────────────────────────────────────────────────────

def _frame(add, page: SchematicPage, doc: SchematicDocument) -> None:
    add(f'<rect x="5" y="5" width="{W - 10:g}" height="{H - 10:g}" fill="none" '
        f'stroke="{_STROKE}" stroke-width="0.3"/>')
    add(f'<rect x="{FRAME_INSET:g}" y="{FRAME_INSET:g}" width="{W - 20:g}" '
        f'height="{H - 20:g}" fill="none" stroke="{_STROKE}" stroke-width="0.7"/>')
    # zone grid: 8 columns / 6 rows (IEC 61082), light ticks outside the border
    for i in range(1, 8):
        x = FRAME_INSET + (W - 2 * FRAME_INSET) * i / 8.0
        add(f'<line x1="{x:g}" y1="5" x2="{x:g}" y2="{FRAME_INSET:g}" stroke="{_STROKE}" stroke-width="0.25"/>')
        add(f'<line x1="{x:g}" y1="{H - FRAME_INSET:g}" x2="{x:g}" y2="{H - 5:g}" stroke="{_STROKE}" stroke-width="0.25"/>')
        add(f'<text x="{x:g}" y="{FRAME_INSET - 1.4:g}" font-size="2.6" text-anchor="middle">{i}</text>')
        add(f'<text x="{x:g}" y="{H - 5.9:g}" font-size="2.6" text-anchor="middle">{i}</text>')
    for i in range(1, 6):
        y = FRAME_INSET + (H - 2 * FRAME_INSET) * i / 6.0
        letter = "ABCDEF"[i]
        add(f'<line x1="5" y1="{y:g}" x2="{FRAME_INSET:g}" y2="{y:g}" stroke="{_STROKE}" stroke-width="0.25"/>')
        add(f'<line x1="{W - FRAME_INSET:g}" y1="{y:g}" x2="{W - 5:g}" y2="{y:g}" stroke="{_STROKE}" stroke-width="0.25"/>')
        add(f'<text x="7.6" y="{y + 1:g}" font-size="2.6" text-anchor="middle">{letter}</text>')
        add(f'<text x="{W - 7.6:g}" y="{y + 1:g}" font-size="2.6" text-anchor="middle">{letter}</text>')

    # title block
    add(f'<rect x="{TITLE_X0:g}" y="{TITLE_Y0:g}" width="{TITLE_W:g}" height="{TITLE_H:g}" '
        f'fill="none" stroke="{_STROKE}" stroke-width="0.7"/>')
    total = len(doc.pages)
    rows = [
        (html.escape(doc.project_name or "EE_Assistant_Project"), 4.0, "start", 3.6),
        (f"{html.escape(page.title_zh)}  ·  {_KIND_BADGE.get(page.kind, page.kind)}", 10.0, "start", 3.0),
        (f"{html.escape(doc.standard)}  {doc.sheet_format}", 16.0, "start", 2.4),
        (f"第 {page.page_no}/{total} 页  Rev A  拓扑v{doc.source_topology_version}", 21.0, "start", 2.6),
    ]
    for text, dy, anchor, size in rows:
        add(f'<text x="{TITLE_X0 + 2:g}" y="{TITLE_Y0 + dy:g}" font-size="{size}" '
            f'text-anchor="{anchor}" fill="#111">{text}</text>')


def _page_chrome(add, page: SchematicPage) -> None:
    if page.kind == "power":
        for label, y in (("L1", 42.0), ("L2", 48.0), ("L3", 54.0)):
            add(f'<text x="24" y="{y + 1:g}" font-size="3.2" text-anchor="end" fill="#111">{label}</text>')
        add('<text x="30" y="37.4" font-size="2.6" fill="#555">3~ 50Hz</text>')
    if page.kind == "control":
        add('<text x="24" y="39.5" font-size="3.2" text-anchor="end" fill="#111">L+</text>')
        add(f'<text x="384" y="39.5" font-size="3.2" fill="#111">0V</text>')
    if page.kind == "io":
        headers = ((60.0, "现场设备"), (200.0, "端子"), (322.0, "PLC 通道"))
        for x, t in headers:
            add(f'<text x="{x:g}" y="48" font-size="2.8" text-anchor="middle" fill="#555">{t}</text>')


def _notes(add, page: SchematicPage) -> None:
    y = 20.0
    for note in page.notes[:6]:
        add(f'<text x="14" y="{y:g}" font-size="2.6" fill="#8a6d3b">※ {html.escape(note[:80])}</text>')
        y += 4.0


def _cross_refs(add, page: SchematicPage) -> None:
    if not page.cross_refs:
        return
    add(f'<text x="14" y="252" font-size="2.6" fill="#333">交叉引用:</text>')
    x = 34.0
    for cr in page.cross_refs[:12]:
        text = f"{cr.ref}({cr.pages[0] if cr.pages else '?'})" if cr.kind == "contact" else cr.ref
        add(f'<text x="{x:g}" y="252" font-size="2.6" fill="#333">{html.escape(text)}</text>')
        x += max(len(text) * 1.9 + 4.0, 12.0)
