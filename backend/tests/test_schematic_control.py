"""Control-circuit (ladder) generator tests: SIL2 chain, 启保停, line numbers."""
from app.core.schematic import build_schematic
from app.core.schematic.control_circuit import build_control_pages
from app.core.schematic.builder import TagRegistry


def _sil2_nodes():
    return [
        {"id": "n_psu", "type": "power", "label": "PSU"},
        {"id": "n_km1", "type": "contactor", "label": "KM1"},
        {"id": "n_estop", "type": "estop", "label": "急停"},
        {"id": "n_kf", "type": "safety_relay", "label": "KF"},
        {"id": "n_hl", "type": "signal_light", "label": "运行灯"},
    ]


def test_sil2_dual_channel_and_kf_guard():
    nodes = _sil2_nodes()
    tags = TagRegistry(nodes)
    pages = build_control_pages(nodes, tags, {"safety_level": "SIL2"})
    assert len(pages) == 1
    page = pages[0]

    # dual-channel e-stop glyphs feeding the KF box
    estops = [s for s in page.symbols if s.symbol_key == "SB_MUSHROOM_NC"]
    kfs = [s for s in page.symbols if s.symbol_key == "KF_SAFETY"]
    assert len(estops) == 2
    assert len(kfs) == 1
    kf_pins = {f"{p.symbol_id}:{p.pin}" for w in page.wires for p in w.pins}
    assert f"{kfs[0].id}:A1" in kf_pins and f"{kfs[0].id}:A2" in kf_pins

    # KM rung guarded by a KF-output contact and self-held by a KM aux contact
    kf_ref = kfs[0].ref
    km_ref = next(s.ref for s in page.symbols if s.symbol_key == "KM_COIL")
    guard = [s for s in page.symbols if s.symbol_key == "KA_NO" and s.ref == kf_ref]
    hold = [s for s in page.symbols if s.symbol_key == "KA_NO" and s.ref == km_ref]
    assert guard, "KF safety-ok contact must guard the contactor rung"
    assert hold, "self-hold contact must carry the contactor ref"


def test_line_numbers_sequential_and_rails_labelled():
    nodes = _sil2_nodes()
    doc = build_schematic({"nodes": nodes, "edges": []}, [], {"safety_level": "SIL2"})
    page = next(p for p in doc.pages if p.kind == "control")
    line_nos = {w.line_no for w in page.wires}
    assert "L" in line_nos and "N" in line_nos
    numbered = sorted(int(n) for n in line_nos if n not in ("L", "N"))
    assert numbered == list(range(1, len(numbered) + 1))


def test_no_contactor_yields_minimal_rung_with_note():
    nodes = [
        {"id": "n_estop", "type": "estop", "label": "急停"},
    ]
    doc = build_schematic({"nodes": nodes, "edges": []}, [], {})
    page = next(p for p in doc.pages if p.kind == "control")
    assert any(s.symbol_key == "SL" for s in page.symbols)
    assert any("最小回路" in n for n in page.notes)


def test_extra_rungs_appended_and_gated():
    nodes = _sil2_nodes()
    extra = [
        {"series": [{"ref_hint": "KM1", "type": "NO", "label": "运行"}],
         "coil": {"ref_hint": "KA1"}},
        {"series": [{"ref_hint": "SB1", "type": "NC"}, {"ref_hint": "KM1", "type": "NO"}],
         "coil": {"ref_hint": "KA2"}},
    ]
    doc = build_schematic({"nodes": nodes, "edges": []}, [], {}, extra_rungs=extra)
    page = next(p for p in doc.pages if p.kind == "control")
    coils = [s for s in page.symbols if s.symbol_key == "KA_COIL"]
    assert len(coils) == 2
    assert any("LLM 翻译" in n for n in page.notes)


def test_extra_rungs_with_garbage_ignored():
    nodes = _sil2_nodes()
    extra = [{"series": [{"ref_hint": "X", "type": "MAYBE"}], "coil": {}}]
    doc = build_schematic({"nodes": nodes, "edges": []}, [], {}, extra_rungs=extra)
    page = next(p for p in doc.pages if p.kind == "control")
    assert not any(s.symbol_key == "KA_COIL" for s in page.symbols)


def test_cross_page_coil_contact_reference():
    nodes = [
        {"id": "n_km1", "type": "contactor", "label": "KM1"},
        {"id": "n_m1", "type": "motor", "label": "M1"},
    ]
    doc = build_schematic(
        {"nodes": nodes,
         "edges": [{"id": "e", "source": "n_km1", "target": "n_m1", "protocol": "POWER_220V"}]},
        [], {},
    )
    km_ref = "-KM1"
    for page in doc.pages:
        for cr in page.cross_refs:
            if cr.ref == km_ref:
                assert set(cr.pages) >= {"1", "2"}
                return
    raise AssertionError("no cross reference for -KM1")
