"""IO / terminal page + netlist tests."""
from app.core.schematic import build_schematic
from app.core.schematic.netlist import merge_nets


def _wiring_rows(n=3, over_idx=None):
    rows = []
    for i in range(n):
        row = {
            "tag": f"PLC.DI{i}",
            "signal": f"传感器 {i}",
            "from": f"X1.{i + 1}",
            "to": f"PLC.DI{i}",
            "wire": "0.75 mm² 黑",
        }
        if over_idx is not None and i == over_idx:
            row["over"] = True
        rows.append(row)
    return rows


def test_io_page_rows_and_terminals():
    doc = build_schematic({"nodes": [{"id": "p", "type": "plc", "label": "PLC"}], "edges": []},
                          [], {"io_list": []}, _wiring_rows(3))
    page = next(p for p in doc.pages if p.kind == "io")
    assert sum(1 for s in page.symbols if s.symbol_key == "X_TERMINAL") == 3
    assert any(s.symbol_key == "PLC_IO_BOX" for s in page.symbols)
    # wire spec labels carried verbatim from the wiring table
    term = next(s for s in page.symbols if s.symbol_key == "X_TERMINAL")
    assert term.attrs.get("wire_spec") == "0.75 mm² 黑"


def test_io_line_numbers_start_at_1001():
    doc = build_schematic({"nodes": [], "edges": []}, [], {}, _wiring_rows(3))
    page = next(p for p in doc.pages if p.kind == "io")
    line_nos = sorted(int(w.line_no) for w in page.wires if w.line_no)
    assert line_nos == [1001, 1002, 1003, 1004, 1005, 1006]  # 2 nets per row


def test_over_row_flagged_with_note():
    doc = build_schematic({"nodes": [], "edges": []}, [], {}, _wiring_rows(3, over_idx=2))
    page = next(p for p in doc.pages if p.kind == "io")
    assert any("EXT" in n for n in page.notes)
    over_syms = [s for s in page.symbols if s.attrs.get("over") == "true"]
    assert over_syms


def test_do_lamp_and_button_symbol_choice():
    rows = [
        {"tag": "PLC.DI0", "signal": "启动按钮", "from": "X1.1", "to": "PLC.DI0", "wire": "0.75 mm² 黑"},
        {"tag": "PLC.DO0", "signal": "运行指示灯", "from": "X1.2", "to": "PLC.DO0", "wire": "0.75 mm² 红"},
    ]
    doc = build_schematic({"nodes": [], "edges": []}, [], {}, rows)
    page = next(p for p in doc.pages if p.kind == "io")
    keys = [s.symbol_key for s in page.symbols]
    assert "SB_NO" in keys      # button description → operator symbol
    assert "SL" in keys         # lamp description → indicator symbol


def test_io_pagination():
    doc = build_schematic({"nodes": [], "edges": []}, [], {}, _wiring_rows(20))
    io_pages = [p for p in doc.pages if p.kind == "io"]
    assert len(io_pages) == 2  # 14 rows per page
    assert all(len([s for s in p.symbols if s.symbol_key == "X_TERMINAL"]) <= 14 for p in io_pages)


def test_merge_nets_unifies_shared_pin():
    from app.core.schematic.ir import PinRef, SchematicPage, SymbolInstance, Wire
    t1 = SymbolInstance(id="t1", ref="-X1", symbol_key="X_TERMINAL", pos=(100.0, 50.0))
    t2 = SymbolInstance(id="t2", ref="-X2", symbol_key="X_TERMINAL", pos=(160.0, 50.0))
    # both wires hang off t1's right pin -> must merge to one net
    w1 = Wire(id="w1", net="A", points=[(106.0, 53.0), (130.0, 53.0)],
              pins=[PinRef(symbol_id="t1", pin="2")])
    w2 = Wire(id="w2", net="B", points=[(106.0, 53.0), (t2.pos[0], 53.0)],
              pins=[PinRef(symbol_id="t1", pin="2")])
    page = SchematicPage(page_no=1, kind="io", title_zh="t", symbols=[t1, t2], wires=[w1, w2])
    merge_nets(page)
    assert w1.net == w2.net
