"""Tests for the I/O wiring generator (WiringPanel data source).

Output shape MUST match frontend's `ioItems[]`:
  {tag, signal, from, to, wire}

The generator pops terminals from the PLC catalog's mounting-order
lists. Capacity overruns are flagged but never crash — they yield
rows with `over=true` so the UI can render them in red.
"""
from app.core.wiring_generator import generate_wiring


PLC_1212 = {
    "category": "PLC_CPU",
    "manufacturer": "Siemens",
    "model": "CPU 1212C DC/DC/DC",
    "order_number": "6ES7212-1AE40-0XB0",
    "quantity": 1,
}


def _io(tag: str, type_: str, description: str = ""):
    return {"tag": tag, "type": type_, "description": description or tag}


def test_returns_one_row_per_io_signal():
    """3 DI + 2 DO signals produce 5 rows; no PLC-only rows."""
    rows = generate_wiring(
        bom_items=[PLC_1212],
        io_list=[
            _io("EM1", "DI", "E-Stop"), _io("LS1", "DI", "Limit"), _io("PB1", "DI", "Start"),
            _io("VL1", "DO", "Valve"), _io("LMP", "DO", "Light"),
        ],
    )
    assert len(rows) == 5


def test_terminal_assignment_starts_at_zero_and_increments():
    """Wiring generator must pop from the front of the catalog's
    terminal list — first DI signal → DI0, second → DI1, etc."""
    rows = generate_wiring(
        bom_items=[PLC_1212],
        io_list=[_io("A", "DI"), _io("B", "DI"), _io("C", "DI")],
    )
    di_tags = [r["tag"] for r in rows]
    assert di_tags == ["PLC.DI0", "PLC.DI1", "PLC.DI2"]


def test_di_and_do_use_separate_terminal_pools():
    """A DI signal and a DO signal cannot reuse the same number;
    they come from different lists."""
    rows = generate_wiring(
        bom_items=[PLC_1212],
        io_list=[_io("A", "DI"), _io("B", "DO")],
    )
    di = next(r for r in rows if r["signal"] == "A")
    do = next(r for r in rows if r["signal"] == "B")
    assert di["tag"] == "PLC.DI0"
    assert do["tag"] == "PLC.DO0"


def test_wire_spec_by_signal_class():
    """Each signal class has a canonical wire spec — these get printed
    on the wiring shop drawing."""
    rows = generate_wiring(
        bom_items=[PLC_1212],
        io_list=[
            _io("D1", "DI"), _io("D2", "DO"), _io("A1", "AI"), _io("A2", "AO"),
        ],
    )
    by_signal = {r["signal"]: r for r in rows}
    assert "0.75" in by_signal["D1"]["wire"] and ("黑" in by_signal["D1"]["wire"] or "BK" in by_signal["D1"]["wire"])
    assert "0.75" in by_signal["D2"]["wire"]
    assert "屏蔽" in by_signal["A1"]["wire"]
    assert "屏蔽" in by_signal["A2"]["wire"]


def test_signal_field_uses_description():
    """When a description is provided it becomes the signal label;
    falls back to tag otherwise."""
    rows = generate_wiring(
        bom_items=[PLC_1212],
        io_list=[_io("EM1", "DI", "Emergency Stop")],
    )
    assert rows[0]["signal"] == "Emergency Stop"
    rows2 = generate_wiring(
        bom_items=[PLC_1212],
        io_list=[{"tag": "EM1", "type": "DI"}],
    )
    assert rows2[0]["signal"] == "EM1"


def test_from_field_is_sequential_terminal_block():
    """The 'from' column tracks the external terminal block reference
    (X1.1, X1.2, ...) — sequential across all rows so an electrician
    can wire them in order."""
    rows = generate_wiring(
        bom_items=[PLC_1212],
        io_list=[_io("A", "DI"), _io("B", "DI"), _io("C", "DO")],
    )
    assert rows[0]["from"].endswith("1")
    assert rows[1]["from"].endswith("2")
    assert rows[2]["from"].endswith("3")
    assert all(r["from"].startswith("X1.") for r in rows)


def test_to_matches_tag():
    """The 'to' column is the PLC terminal — same as `tag`, just
    duplicated for the readable wiring table."""
    rows = generate_wiring(
        bom_items=[PLC_1212],
        io_list=[_io("X", "DI"), _io("Y", "AO")],
    )
    for r in rows:
        assert r["to"] == r["tag"]


def test_over_capacity_marks_row_but_keeps_going():
    """CPU 1212C only has 8 DI. The 9th DI signal must produce a row
    with `over=true` and a clearly-marked synthetic terminal — no
    crash, no silent drop."""
    rows = generate_wiring(
        bom_items=[PLC_1212],
        io_list=[_io(f"D{i}", "DI") for i in range(10)],  # 10 DI > 8 capacity
    )
    assert len(rows) == 10
    over_rows = [r for r in rows if r.get("over")]
    assert len(over_rows) == 2  # signals 9 and 10
    # Synthetic terminals labelled with EXT or OVER so the UI can flag them.
    assert all("EXT" in r["tag"] or "OVER" in r["tag"] for r in over_rows)


def test_no_plc_returns_empty():
    """Without a PLC in the BOM, there's no terminal pool — return
    empty list so WiringPanel shows its empty state."""
    rows = generate_wiring(
        bom_items=[{"category": "Relay", "manufacturer": "Omron", "quantity": 1}],
        io_list=[_io("X", "DI")],
    )
    assert rows == []


def test_empty_io_list_returns_empty():
    rows = generate_wiring(bom_items=[PLC_1212], io_list=[])
    assert rows == []


def test_unknown_io_type_skipped():
    """Don't crash on weird types — just skip the row."""
    rows = generate_wiring(
        bom_items=[PLC_1212],
        io_list=[_io("A", "COMM"), _io("B", "DI")],
    )
    assert len(rows) == 1
    assert rows[0]["signal"] == "B"
