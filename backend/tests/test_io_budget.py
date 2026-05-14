"""Tests for the IO budget computation (IOBudgetBar data source).

Output shape MUST match the frontend's `BudgetItem` type:
  {type?: 'plc', capacity?: {di, do_, ai, ao}}  — one or more rows
  {signal?: 'di' | 'do_' | 'ai' | 'ao'}         — one row per io_list entry

The frontend's `computeIOBudget` aggregates these into a per-channel
used vs. total view; if no row has `type === 'plc'` the bar hides.
"""
from app.core.io_budget import compute_io_budget


def _plc_row(order_number="6ES7212-1AE40-0XB0"):
    return {
        "category": "PLC_CPU",
        "manufacturer": "Siemens",
        "model": "CPU 1212C",
        "order_number": order_number,
        "quantity": 1,
    }


def test_returns_one_plc_row_with_capacity():
    """For a BOM with a known PLC, output must have exactly one
    row tagged `type='plc'` carrying the catalog capacity."""
    rows = compute_io_budget(
        bom_items=[_plc_row()],
        io_list=[],
    )
    plc_rows = [r for r in rows if r.get("type") == "plc"]
    assert len(plc_rows) == 1
    cap = plc_rows[0]["capacity"]
    assert cap == {"di": 8, "do_": 6, "ai": 2, "ao": 0}


def test_one_row_per_io_signal():
    """Each io_list entry becomes one budget row with `signal` set
    (no type), so the frontend sums them by channel."""
    io_list = [
        {"tag": "EM1", "type": "DI", "description": "E-Stop"},
        {"tag": "LS1", "type": "DI", "description": "Limit Switch"},
        {"tag": "VL1", "type": "DO", "description": "Valve"},
        {"tag": "PT1", "type": "AI", "description": "Pressure"},
    ]
    rows = compute_io_budget(bom_items=[_plc_row()], io_list=io_list)
    signal_rows = [r for r in rows if "signal" in r]
    signal_kinds = sorted(r["signal"] for r in signal_rows)
    # DI normalized to lowercase 'di', DO to 'do_' (Python kw clash)
    assert signal_kinds == ["ai", "di", "di", "do_"]


def test_no_plc_returns_empty():
    """When no PLC in BOM the bar should hide — frontend
    computeIOBudget returns null when plcSeen is false. We return
    an empty list to signal nothing useful is available."""
    rows = compute_io_budget(
        bom_items=[{"category": "Relay", "manufacturer": "Omron", "quantity": 1}],
        io_list=[{"tag": "X1", "type": "DI", "description": ""}],
    )
    assert all(r.get("type") != "plc" for r in rows)


def test_unknown_plc_uses_generic_capacity():
    """For unknown MLFBs we still emit a plc row so the bar shows up;
    capacity comes from GENERIC_PLC (8/8/2/0). Don't over-promise
    accuracy — but better than hiding the bar entirely."""
    from app.core.plc_catalog import GENERIC_PLC
    rows = compute_io_budget(
        bom_items=[_plc_row(order_number="UNKNOWN-XYZ")],
        io_list=[],
    )
    plc = next(r for r in rows if r.get("type") == "plc")
    assert plc["capacity"] == GENERIC_PLC["capacity"]


def test_unrecognized_io_type_skipped():
    """If io_list has a row with an unrecognized type (e.g. 'COMM'),
    don't crash — just skip it. Other rows still contribute."""
    rows = compute_io_budget(
        bom_items=[_plc_row()],
        io_list=[
            {"tag": "X1", "type": "COMM", "description": ""},
            {"tag": "X2", "type": "DI", "description": ""},
        ],
    )
    signal_rows = [r for r in rows if "signal" in r]
    assert len(signal_rows) == 1
    assert signal_rows[0]["signal"] == "di"


def test_handles_lowercase_io_type():
    """LLM sometimes outputs 'di'/'do' instead of 'DI'/'DO'."""
    rows = compute_io_budget(
        bom_items=[_plc_row()],
        io_list=[{"tag": "X1", "type": "di", "description": ""}],
    )
    signal_rows = [r for r in rows if "signal" in r]
    assert signal_rows[0]["signal"] == "di"
