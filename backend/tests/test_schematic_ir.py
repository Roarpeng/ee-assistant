"""Schematic IR + symbol library unit tests."""
import pytest

from app.core.schematic.ir import (
    PinRef,
    SchematicDocument,
    SchematicPage,
    SymbolInstance,
    Wire,
    validate_schematic_ir,
)
from app.core.schematic.symbols import SYMBOLS, get_symbol, pin_point


def _contact(page_no: int = 1, x: float = 40.0, kind: str = "control") -> SchematicPage:
    """Two chained contacts with a properly anchored wire between them."""
    a = SymbolInstance(id="s1", ref="-KM1", symbol_key="KM_NO", pos=(x, 20.0))
    b = SymbolInstance(id="s2", ref="-KA1", symbol_key="KA_NO", pos=(x + 34.0, 20.0))
    p1 = pin_point("KM_NO", a.pos, "2")
    p2 = pin_point("KA_NO", b.pos, "1")
    wire = Wire(
        id="w1", net="N1", points=[p1, p2],
        pins=[PinRef(symbol_id="s1", pin="2"), PinRef(symbol_id="s2", pin="1")],
        line_no="1",
    )
    return SchematicPage(page_no=page_no, kind=kind, title_zh="t",
                         symbols=[a, b], wires=[wire])


def test_validate_ok():
    doc = SchematicDocument(pages=[_contact()])
    ok, reason = validate_schematic_ir(doc)
    assert ok, reason


def test_validate_rejects_non_increasing_page_numbers():
    doc = SchematicDocument(pages=[_contact(page_no=2), _contact(page_no=2)])
    ok, reason = validate_schematic_ir(doc)
    assert not ok
    assert "strictly increase" in reason


def test_validate_rejects_endpoint_off_pin():
    page = _contact()
    page.wires[0].points[0] = (page.wires[0].points[0][0] + 5.0, page.wires[0].points[0][1])
    ok, reason = validate_schematic_ir(SchematicDocument(pages=[page]))
    assert not ok
    assert "endpoint not on pin" in reason


def test_validate_rejects_unknown_pin():
    page = _contact()
    page.wires[0].pins.append(PinRef(symbol_id="s1", pin="ZZ"))
    ok, reason = validate_schematic_ir(SchematicDocument(pages=[page]))
    assert not ok
    assert "no pin" in reason


def test_validate_requires_line_numbers_on_control_pages():
    page = _contact()
    page.wires[0].line_no = None
    ok, reason = validate_schematic_ir(SchematicDocument(pages=[page]))
    assert not ok
    assert "no line number" in reason


def test_validate_detects_disconnected_net_group():
    page = _contact()
    # a second wire on the same net that touches nothing
    page.wires.append(Wire(id="w2", net="N1", points=[(200.0, 5.0), (220.0, 5.0)]))
    ok, reason = validate_schematic_ir(SchematicDocument(pages=[page]))
    assert not ok
    assert "disconnected" in reason


def test_symbol_registry_integrity():
    assert len(SYMBOLS) >= 20
    for key, sym in SYMBOLS.items():
        assert sym.width > 0 and sym.height > 0, key
        if key in ("PLC_IO_BOX", "GENERIC_BOX"):
            continue  # page-specific channel pins are wired without anchors
        assert sym.pins, f"{key} has no pins"
        for p in sym.pins:
            assert 0 <= p.dx <= sym.width + 0.01, f"{key}.{p.name} dx outside bbox"
            assert 0 <= p.dy <= sym.height + 0.01, f"{key}.{p.name} dy outside bbox"


def test_get_symbol_falls_back_to_generic():
    sym = get_symbol("NOT_A_REAL_KEY")
    assert sym.key == "GENERIC_BOX"


def test_pin_point_anchors():
    pt = pin_point("KM_COIL", (100.0, 50.0), "A2")
    assert pt == (116.0, 57.0)


def test_empty_document_invalid():
    ok, _ = validate_schematic_ir(SchematicDocument(pages=[]))
    assert not ok
