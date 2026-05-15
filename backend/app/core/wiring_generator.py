"""I/O terminal wiring generator (WiringPanel data source).

Deterministic — assigns physical PLC terminals to requirement io_list
entries by popping from the PLC catalog's mounting-order terminal
lists. Capacity overruns are tolerated: extra signals get synthetic
'EXT' terminals with `over=true` so the UI can highlight them in red.

Output shape: list of {tag, signal, from, to, wire, over?} matching
frontend's `ioItems[]` consumed by WiringPanel.
"""
from __future__ import annotations

from app.core.plc_catalog import GENERIC_PLC, lookup_plc


# Wire spec by signal channel. Conservative cross-sections that
# match Chinese electrical practice (GB) and matter for the shop
# drawing the WiringPanel produces.
_WIRE_SPEC = {
    "di": "0.75 mm² 黑",
    "do_": "0.75 mm² 红",
    "ai": "0.5 mm² 屏蔽双绞",
    "ao": "0.5 mm² 屏蔽双绞",
}


# Map every reasonable upstream spelling onto the canonical channel id.
_TYPE_TO_CHANNEL = {
    "di": "di", "DI": "di",
    "do": "do_", "DO": "do_", "do_": "do_",
    "ai": "ai", "AI": "ai",
    "ao": "ao", "AO": "ao",
    "digitalinput": "di", "digital_input": "di",
    "digitaloutput": "do_", "digital_output": "do_",
    "analoginput": "ai", "analog_input": "ai",
    "analogoutput": "ao", "analog_output": "ao",
}


def _channel_of(io_type: str | None) -> str | None:
    if not io_type:
        return None
    key = io_type.strip()
    return _TYPE_TO_CHANNEL.get(key) or _TYPE_TO_CHANNEL.get(key.lower())


def _channel_label(channel: str) -> str:
    """Channel id -> display label in tag (DI/DO/AI/AO)."""
    return {"di": "DI", "do_": "DO", "ai": "AI", "ao": "AO"}[channel]


def _find_plc_spec(bom_items: list[dict]):
    """Return the first PLC's catalog spec, or None if no PLC in BOM."""
    for item in bom_items or []:
        if item.get("category") != "PLC_CPU":
            continue
        return lookup_plc(item.get("order_number", "")) or GENERIC_PLC
    return None


def generate_wiring(
    bom_items: list[dict],
    io_list: list[dict],
) -> list[dict]:
    """Produce the wiring table for WiringPanel.

    Returns [] when no PLC in BOM or no IO signals — the WiringPanel
    handles the empty state.
    """
    spec = _find_plc_spec(bom_items)
    if spec is None:
        return []

    # Mutable pools per channel — popping from the front preserves
    # mounting order (DI0 → DI1 → ...).
    pools: dict[str, list[str]] = {
        ch: list(spec["terminals"][ch]) for ch in ("di", "do_", "ai", "ao")
    }
    overflow_counters: dict[str, int] = {"di": 0, "do_": 0, "ai": 0, "ao": 0}

    rows: list[dict] = []
    block_idx = 0

    for io in io_list or []:
        channel = _channel_of(io.get("type"))
        if channel is None:
            continue

        block_idx += 1
        signal = (io.get("description") or "").strip() or (io.get("tag") or "").strip() or "?"

        pool = pools[channel]
        if pool:
            terminal = pool.pop(0)
            tag = f"PLC.{terminal}"
            over = False
        else:
            overflow_counters[channel] += 1
            tag = f"PLC.{_channel_label(channel)}{spec['capacity'][channel] + overflow_counters[channel] - 1}-EXT"
            over = True

        wire = _WIRE_SPEC[channel]

        row = {
            "tag": tag,
            "signal": signal,
            "from": f"X1.{block_idx}",
            "to": tag,
            "wire": wire,
        }
        if over:
            row["over"] = True
        rows.append(row)

    return rows
