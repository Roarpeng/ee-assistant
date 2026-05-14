"""Indicative BOM prices in CNY for the project cost estimator.

This is intentionally rough — order-of-magnitude pricing keyed on
category × brand tier. The UI labels the resulting `bomCost` as 估算
so users know it's not a real quote. For exact prices, integrate
with a distributor catalog (out of scope).

For PLC entries, prefer `plc_catalog.lookup_plc(order_number).price_cny`
when the order number is known — that's keyed at the model level and
more accurate than the category baseline used here.
"""
from __future__ import annotations


# Baseline price by category, in CNY, for a generic/Asian-tier brand.
_BASELINE: dict[str, int] = {
    "PLC_CPU":             2500,
    "Safety_PLC":          8000,
    "IO_Module":           1500,
    "Communication_Module": 1800,
    "HMI":                 3500,
    "VFD":                 3200,
    "Servo_Drive":         5000,
    "Power_Supply":         400,
    "Circuit_Breaker":      150,
    "Contactor":            120,
    "Relay":                 60,
    "Safety_Relay":         800,
    "Sensor":               180,
    "E_Stop":                90,
    "Transformer":          600,
    "Fuse":                  30,
    "Disconnect":           250,
}


# Premium brands command roughly 1.4-1.8× the baseline. Matched on a
# prefix of the manufacturer string (case-insensitive) to tolerate
# slight name variations ("Siemens AG", "SIEMENS", "siemens" all hit).
_BRAND_MULTIPLIER: list[tuple[str, float]] = [
    ("siemens",     1.6),
    ("beckhoff",    1.7),
    ("schneider",   1.4),
    ("rockwell",    1.7),
    ("allen-bradley", 1.7),
    ("phoenix",     1.4),
    ("omron",       1.3),
    ("mitsubishi",  1.3),
]


def _brand_factor(manufacturer: str) -> float:
    m = (manufacturer or "").lower().strip()
    for prefix, factor in _BRAND_MULTIPLIER:
        if m.startswith(prefix):
            return factor
    return 1.0


def estimate_price(bom_row: dict) -> int:
    """Return an indicative CNY price for a BOM row.

    Returns 0 (honest) when the category is unknown — better than
    fabricating a number. Callers should sum these and clearly label
    the total as 估算.
    """
    category = (bom_row.get("category") or "").strip()
    if not category:
        return 0
    base = _BASELINE.get(category, 0)
    if base == 0:
        return 0
    return int(round(base * _brand_factor(bom_row.get("manufacturer", ""))))
