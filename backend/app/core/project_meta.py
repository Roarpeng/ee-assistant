"""Project-level metadata aggregator for the InfoPanel.

Computes the two top-line stats the InfoPanel shows:
- `safety_level`: pulled from the analyzed requirement (already in state)
- `bom_cost`: summed indicative price across the BOM

The PLC catalog is preferred for line items where the order_number is
known (per-model price); everything else falls back to the
category × brand tier baseline. Unknown rows contribute 0 honestly.
"""
from __future__ import annotations

from app.core.bom_prices import estimate_price
from app.core.plc_catalog import lookup_plc


def _row_price(row: dict) -> int:
    """Best-effort indicative price for one BOM row, in CNY."""
    order_number = (row.get("order_number") or "").strip()
    if order_number:
        plc = lookup_plc(order_number)
        if plc is not None:
            return plc["price_cny"]
    return estimate_price(row)


def compute_project_meta(
    bom_items: list[dict],
    safety_level: str | None,
) -> dict:
    """Aggregate the InfoPanel stats from the final-state BOM."""
    total = 0
    for row in bom_items or []:
        qty_raw = row.get("quantity", 1)
        try:
            qty = int(qty_raw) if qty_raw is not None else 1
        except (TypeError, ValueError):
            qty = 1
        total += _row_price(row) * qty

    return {
        "safety_level": safety_level,
        "bom_cost": int(total),
    }
