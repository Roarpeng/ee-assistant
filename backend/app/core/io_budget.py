"""IO budget aggregator — feeds the IOBudgetBar on the topology canvas.

Output shape mirrors the frontend's BudgetItem[] union exactly:
  {type: 'plc', capacity: {di, do_, ai, ao}}
  {signal: 'di' | 'do_' | 'ai' | 'ao'}

The frontend's `computeIOBudget(budgetItems)` sums these into a
per-channel used vs. total view and hides the bar when no PLC row
is present.

We tolerate LLM/upstream messiness:
- Order numbers missing from catalog → use GENERIC_PLC (8/8/2/0)
- io_list `type` may be 'DI'/'di'/'DigitalInput' etc — we normalize
- Unrecognized types → skip the row, never crash
"""
from __future__ import annotations

from app.core.plc_catalog import GENERIC_PLC, lookup_plc


# Map every reasonable upstream spelling onto the canonical channel id
# used internally. 'do_' (with underscore) is the convention shared
# with the frontend to avoid the Python `do` keyword.
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


def compute_io_budget(
    bom_items: list[dict],
    io_list: list[dict],
) -> list[dict]:
    """Return BudgetItem[] for the frontend's IOBudgetBar.

    Empty list when no PLC in BOM — the frontend hides the bar in
    that case.
    """
    rows: list[dict] = []

    # PLC capacity rows
    for item in bom_items or []:
        if item.get("category") != "PLC_CPU":
            continue
        spec = lookup_plc(item.get("order_number", "")) or GENERIC_PLC
        rows.append({
            "type": "plc",
            "model": item.get("model") or item.get("order_number") or "",
            "capacity": dict(spec["capacity"]),
        })

    # Skip signal aggregation entirely when no PLC — keeps the bar hidden.
    if not any(r.get("type") == "plc" for r in rows):
        return rows

    # IO signal rows — one per requirement io_list entry.
    for io in io_list or []:
        ch = _channel_of(io.get("type"))
        if ch is None:
            continue
        rows.append({"signal": ch})

    return rows
