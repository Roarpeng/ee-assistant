"""Tests for the project meta aggregator (InfoPanel data source).

`compute_project_meta` walks the BOM, looks each line up in the
PLC catalog (preferred — accurate per-model price) or the BOM price
table (fallback by category × brand tier), and returns a dict the
frontend can drop straight into the InfoPanel.
"""
from app.core.project_meta import compute_project_meta


def test_returns_safety_level_and_bom_cost_keys():
    """The InfoPanel expects exactly these two fields. Shape is the
    contract — never change without updating the frontend dispatch."""
    result = compute_project_meta(
        bom_items=[{"category": "PLC_CPU", "manufacturer": "Siemens", "quantity": 1}],
        safety_level="SIL2",
    )
    assert set(result.keys()) == {"safety_level", "bom_cost"}
    assert result["safety_level"] == "SIL2"
    assert isinstance(result["bom_cost"], int)
    assert result["bom_cost"] > 0


def test_sums_across_bom_with_quantity():
    """A relay × 5 should cost ~5× a relay × 1."""
    one = compute_project_meta(
        bom_items=[{"category": "Relay", "manufacturer": "Omron", "quantity": 1}],
        safety_level=None,
    )
    five = compute_project_meta(
        bom_items=[{"category": "Relay", "manufacturer": "Omron", "quantity": 5}],
        safety_level=None,
    )
    assert five["bom_cost"] == 5 * one["bom_cost"]


def test_plc_uses_catalog_price_when_order_number_known():
    """For a known MLFB (CPU 1212C DC/DC/DC), catalog price is
    authoritative — must override the category baseline."""
    from app.core.plc_catalog import lookup_plc
    catalog_price = lookup_plc("6ES7212-1AE40-0XB0")["price_cny"]
    result = compute_project_meta(
        bom_items=[{
            "category": "PLC_CPU",
            "manufacturer": "Siemens",
            "order_number": "6ES7212-1AE40-0XB0",
            "quantity": 1,
        }],
        safety_level=None,
    )
    assert result["bom_cost"] == catalog_price


def test_plc_falls_back_to_category_price_when_unknown_order_number():
    """Unknown MLFB → use the category × brand baseline. Honest, not zero."""
    result = compute_project_meta(
        bom_items=[{
            "category": "PLC_CPU",
            "manufacturer": "Siemens",
            "order_number": "UNKNOWN-XYZ",
            "quantity": 1,
        }],
        safety_level=None,
    )
    assert result["bom_cost"] > 0


def test_unknown_category_contributes_zero():
    """Honest 0 — InfoPanel will still show real components."""
    result = compute_project_meta(
        bom_items=[
            {"category": "Unobtainium", "manufacturer": "ACME", "quantity": 1},
            {"category": "PLC_CPU", "manufacturer": "Siemens", "quantity": 1},
        ],
        safety_level=None,
    )
    # Only PLC contributes.
    plc_only = compute_project_meta(
        bom_items=[{"category": "PLC_CPU", "manufacturer": "Siemens", "quantity": 1}],
        safety_level=None,
    )
    assert result["bom_cost"] == plc_only["bom_cost"]


def test_empty_bom_returns_zero_cost():
    result = compute_project_meta(bom_items=[], safety_level="SIL3")
    assert result == {"safety_level": "SIL3", "bom_cost": 0}


def test_missing_quantity_defaults_to_one():
    """LLM BOMs sometimes drop the qty field."""
    with_qty = compute_project_meta(
        bom_items=[{"category": "Relay", "manufacturer": "Omron", "quantity": 1}],
        safety_level=None,
    )
    no_qty = compute_project_meta(
        bom_items=[{"category": "Relay", "manufacturer": "Omron"}],
        safety_level=None,
    )
    assert with_qty["bom_cost"] == no_qty["bom_cost"]
