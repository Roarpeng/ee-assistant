"""Power-circuit page generator tests (3 canonical fixtures)."""
from app.core.schematic import build_schematic


def _conveyor_topology():
    """Single-VFD conveyor: breaker → {contactor→M1, VFD→M2}."""
    return {
        "nodes": [
            {"id": "n_psu", "type": "power", "label": "24V PSU"},
            {"id": "n_qf", "type": "circuit_breaker", "label": "Main QF"},
            {"id": "n_km1", "type": "contactor", "label": "KM1"},
            {"id": "n_vfd", "type": "vfd", "label": "VFD"},
            {"id": "n_m1", "type": "motor", "label": "M1"},
            {"id": "n_m2", "type": "motor", "label": "M2"},
        ],
        "edges": [
            {"id": "e1", "source": "n_qf", "target": "n_km1", "protocol": "POWER_220V"},
            {"id": "e2", "source": "n_qf", "target": "n_vfd", "protocol": "POWER_220V"},
            {"id": "e3", "source": "n_km1", "target": "n_m1", "protocol": "POWER_220V"},
            {"id": "e4", "source": "n_vfd", "target": "n_m2", "protocol": "POWER_220V"},
        ],
    }


def test_conveyor_produces_power_page_with_bus_and_branches():
    doc = build_schematic(_conveyor_topology(), [], {})
    power = [p for p in doc.pages if p.kind == "power"]
    assert len(power) == 1
    page = power[0]
    keys = {s.symbol_key for s in page.symbols}
    assert "QF_3P" in keys
    assert "KM_MAIN_3P" in keys
    assert "VFD_BOX" in keys
    assert sum(1 for s in page.symbols if s.symbol_key == "M_3PH") == 2
    # three-phase bus: nets shared across branch drops survive the merge
    nets = {w.net for w in page.wires}
    assert len(nets) >= 5
    # every branch drop lands on a breaker pole pin
    qf = next(s for s in page.symbols if s.symbol_key == "QF_3P")
    pole_pins = {f"{qf.id}:L1", f"{qf.id}:L2", f"{qf.id}:L3"}
    used = {f"{p.symbol_id}:{p.pin}" for w in page.wires for p in w.pins}
    assert pole_pins <= used


def test_no_execution_devices_omits_power_page():
    topology = {"nodes": [{"id": "a", "type": "plc", "label": "PLC"}], "edges": []}
    doc = build_schematic(topology, [], {})
    assert [p for p in doc.pages if p.kind == "power"] == []


def test_missing_breaker_synthesizes_default_with_note():
    topology = {
        "nodes": [
            {"id": "km", "type": "contactor", "label": "KM1"},
            {"id": "m", "type": "motor", "label": "M1"},
        ],
        "edges": [{"id": "e", "source": "km", "target": "m", "protocol": "POWER_220V"}],
    }
    doc = build_schematic(topology, [], {})
    power = next(p for p in doc.pages if p.kind == "power")
    assert any("默认" in n for n in power.notes)
    assert any(s.symbol_key == "QF_3P" for s in power.symbols)


def test_orphan_motor_gets_own_branch():
    topology = {
        "nodes": [
            {"id": "qf", "type": "circuit_breaker", "label": "QF"},
            {"id": "km", "type": "contactor", "label": "KM"},
            {"id": "m", "type": "motor", "label": "M"},
        ],
        "edges": [{"id": "e", "source": "km", "target": "m", "protocol": "POWER_220V"}],
    }
    doc = build_schematic(topology, [], {})
    power = next(p for p in doc.pages if p.kind == "power")
    assert sum(1 for s in power.symbols if s.symbol_key == "M_3PH") == 1


def test_branch_pagination_cap():
    nodes = [{"id": "qf", "type": "circuit_breaker", "label": "QF"}]
    for i in range(8):
        nodes.append({"id": f"km{i}", "type": "contactor", "label": f"KM{i}"})
        nodes.append({"id": f"m{i}", "type": "motor", "label": f"M{i}"})
    edges = [
        {"id": f"e{i}", "source": f"km{i}", "target": f"m{i}", "protocol": "POWER_220V"}
        for i in range(8)
    ]
    doc = build_schematic({"nodes": nodes, "edges": edges}, [], {})
    power_pages = [p for p in doc.pages if p.kind == "power"]
    assert len(power_pages) == 2  # 6 branches per page
    assert all(len([s for s in p.symbols if s.symbol_key == "M_3PH"]) <= 6 for p in power_pages)


def test_bom_only_fallback_still_generates():
    bom = [
        {"category": "CIRCUIT_BREAKER", "manufacturer": "A", "model": "B"},
        {"category": "CONTACTOR", "manufacturer": "A", "model": "C"},
        {"category": "MOTOR", "manufacturer": "A", "model": "D"},
    ]
    doc = build_schematic(None, bom, {})
    assert any(p.kind == "power" for p in doc.pages)
    assert any(p.kind == "control" for p in doc.pages)
