"""Terminal / IO circuit page generator — deterministic.

One horizontal row per `wiring_generator` row:

    [field device]────[X terminal]────[PLC channel |]

Field symbol choice follows the signal channel + description keywords
(button → SB, lamp → HL, sensor/probe → SQ, relay output → KA coil).
Wire cross-section / colour labels come verbatim from the wiring table,
so the schematic page and the WiringPanel can never disagree. Overflow
rows (`over=true`) render red with an EXT badge + page note.
"""
from __future__ import annotations

import re

from app.core.schematic.ir import PinRef, SchematicPage, SymbolInstance, Wire
from app.core.schematic.symbols import get_symbol, pin_point

ROW_Y0 = 56.0
ROW_PITCH = 16.0
MAX_ROWS_PER_PAGE = 14
FIELD_X = 60.0
TERMINAL_X = 200.0
PLC_BOX_X = 320.0
PLC_BOX_W = 50.0

_PLANT_WIDTH = 140.0  # reserved for field-side labels (mm)


def _field_pin_name(key: str) -> str:
    return "A2" if key == "KA_COIL" else "2"


def _pin_dy(key: str) -> float:
    sym = get_symbol(key)
    name = _field_pin_name(key)
    for p in sym.pins:
        if p.name == name:
            return p.dy
    return sym.height / 2.0


def _channel(io_type: str | None) -> str:
    t = (io_type or "").strip().upper()
    return {"DI": "di", "DO": "do", "AI": "ai", "AO": "ao"}.get(t, "di")


def _channel_from_row(row: dict) -> str:
    """Recover the channel from the PLC terminal tag (e.g. 'PLC.DO3')."""
    m = re.search(r"\.(DI|DO|AI|AO)", str(row.get("tag") or "").upper())
    return m.group(1).lower() if m else "di"


def _field_symbol(channel: str, description: str) -> tuple[str, str]:
    """(symbol_key, topology type for ref prefix) by channel + keywords."""
    d = (description or "").lower()
    if channel == "di":
        if any(k in d for k in ("按钮", "button", "启动", "停止", "复位", "reset")):
            return "SB_NO", "switch"
        if any(k in d for k in ("急停", "estop", "e-stop")):
            return "SB_MUSHROOM_NC", "estop"
        if any(k in d for k in ("门", "door", "guard")):
            return "SG_DOOR_NC", "safety_door"
        return "SQ_PROX", "sensor"
    if channel == "do":
        if any(k in d for k in ("灯", "light", "指示", "运行", "报警", "alarm", "lamp")):
            return "SL", "signal_light"
        return "KA_COIL", "relay"
    return "SQ_PROX", "sensor"  # ai / ao


def build_io_pages(wiring_rows: list[dict], tags, requirement: dict | None = None) -> list[SchematicPage]:
    rows = [r for r in (wiring_rows or []) if isinstance(r, dict) and (r.get("tag") or r.get("signal"))]
    if not rows:
        return []

    notes: list[str] = []
    pages: list[SchematicPage] = []
    n = 0

    for start in range(0, len(rows), MAX_ROWS_PER_PAGE):
        chunk = rows[start:start + MAX_ROWS_PER_PAGE]
        symbols: list[SymbolInstance] = []
        wires: list[Wire] = []
        overs = 0

        for j, row in enumerate(chunk):
            n += 1
            ry = ROW_Y0 + j * ROW_PITCH
            channel = _channel_from_row(row)
            desc = str(row.get("signal") or row.get("tag") or "")
            key, ref_type = _field_symbol(channel, desc)

            over = bool(row.get("over"))
            if over:
                overs += 1

            field = SymbolInstance(
                id=f"io_s{n}", ref=tags.free_ref(ref_type), symbol_key=key,
                pos=(FIELD_X, round(ry - _pin_dy(key), 3)),
                attrs={"label": desc[:44]},
            )
            symbols.append(field)

            term = SymbolInstance(
                id=f"io_t{n}", ref=tags.free_ref("terminal"), symbol_key="X_TERMINAL",
                pos=(TERMINAL_X, round(ry - 3.0, 3)),
                attrs={"wire_spec": str(row.get("wire") or ""),
                       "channel": str(row.get("tag") or ""),
                       "over": "true" if over else ""},
            )
            symbols.append(term)

            pin2 = "A2" if key == "KA_COIL" else "2"
            fx = round(pin_point(key, field.pos, pin2)[0], 3)
            wires.append(Wire(
                id=f"io_w{n}a", net=f"FIO{n}",
                points=[(fx, ry), (TERMINAL_X, ry)],
                pins=[PinRef(symbol_id=field.id, pin=pin2), PinRef(symbol_id=term.id, pin="1")],
            ))
            wires.append(Wire(
                id=f"io_w{n}b", net=f"TIO{n}",
                points=[(round(TERMINAL_X + 6.0, 3), ry), (PLC_BOX_X, ry)],
                pins=[PinRef(symbol_id=term.id, pin="2")],
            ))

        plc = SymbolInstance(
            id=f"io_p{start // MAX_ROWS_PER_PAGE + 1}",
            ref=tags.plc_ref(),
            symbol_key="PLC_IO_BOX",
            pos=(PLC_BOX_X, ROW_Y0 - 14.0),
            attrs={"height": str(round(len(chunk) * ROW_PITCH + 28.0, 1)),
                   "label": "PLC"},
        )
        symbols.append(plc)

        page_notes = list(notes)
        notes = []
        if overs:
            page_notes.append(
                f"{overs} 行超出 PLC 通道容量（EXT 虚拟通道，红色标注），需扩展 IO 模块。"
            )
        pages.append(SchematicPage(
            page_no=0, kind="io",
            title_zh="端子与 IO 回路",
            symbols=symbols, wires=wires, notes=page_notes,
        ))
    return pages


def _io_type_of(row: dict, requirement: dict | None) -> str | None:
    """Legacy helper: recover io_type from requirement.io_list by tag."""
    tag = str(row.get("tag") or "")
    for io in (requirement or {}).get("io_list") or []:
        if isinstance(io, dict) and str(io.get("tag") or "") == tag:
            return io.get("type")
    return None
