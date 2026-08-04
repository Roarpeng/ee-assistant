"""Tests for deterministic EPlan XML generation and validation."""
import xml.etree.ElementTree as ET

from app.core.eplan_xml import (
    build_eplan_xml_deterministic,
    validate_eplan_xml,
)

BOM = [
    {"category": "PLC_CPU", "manufacturer": "Siemens", "model": "6ES7214-1AG40-0XB0", "order_number": "6ES7214-1AG40-0XB0"},
    {"category": "circuit_breaker", "manufacturer": "Schneider", "model": "iC65N 3P 32A"},
    {"category": "contactor", "manufacturer": "Siemens", "model": "3RT2016-1BB41"},
    {"category": "estop", "manufacturer": "Schmersal", "model": "AZM161"},
    {"category": "vfd", "manufacturer": "Siemens", "model": "V20 0.75kW"},
]

WIRING = [
    {"tag": "PLC.I0.0", "signal": "启动按钮", "from": "X1.1", "to": "PLC.I0.0", "wire": "0.75 mm² 黑"},
    {"tag": "PLC.Q0.0", "signal": "接触器线圈", "from": "X1.2", "to": "PLC.Q0.0", "wire": "0.75 mm² 红"},
]


def test_deterministic_generation_is_valid():
    xml = build_eplan_xml_deterministic(BOM, WIRING, {"machine_type": "conveyor"})
    ok, reason = validate_eplan_xml(xml)
    assert ok, reason


def test_deterministic_parts_have_iec_tags_and_dt():
    xml = build_eplan_xml_deterministic(BOM, [])
    root = ET.fromstring(xml)
    parts = list(root.iter("Part"))
    assert len(parts) == len(BOM)
    ids = [p.get("ID") for p in parts]
    # IEC-style prefixes: PLC→-A, breaker→-Q, contactor→-K, estop→-S, vfd→-U
    assert ids[0].startswith("-A")
    assert ids[1].startswith("-Q")
    assert ids[2].startswith("-K")
    assert ids[3].startswith("-S")
    assert ids[4].startswith("-U")
    assert all(p.get("DT", "").startswith("=PANEL+") for p in parts)


def test_wiring_rows_become_connections_with_terminal_block():
    xml = build_eplan_xml_deterministic(BOM, WIRING)
    root = ET.fromstring(xml)
    conns = list(root.iter("Connection"))
    assert len(conns) == len(WIRING)
    # Terminal block -X1 auto-added as a part
    part_ids = [p.get("ID") for p in root.iter("Part")]
    assert "-X1" in part_ids
    # Connection targets the PLC part and carries wire data
    first = conns[0]
    assert first.get("SourcePartID") == "-X1"
    assert first.get("SourceTerminal") == "1"
    assert first.get("TargetTerminal") == "I0.0"
    assert first.get("WireCrossSection") == "0.75 mm²"
    assert first.get("WireColor") == "黑"
    assert first.get("TargetPartID", "").startswith("-A")


def test_large_bom_not_truncated():
    """60-item BOM must serialize fully — no token limit applies."""
    big_bom = [
        {"category": "sensor", "manufacturer": "Sick", "model": f"WT2-{i}", "order_number": f"1{i:05d}"}
        for i in range(60)
    ]
    xml = build_eplan_xml_deterministic(big_bom, [])
    ok, reason = validate_eplan_xml(xml)
    assert ok, reason
    root = ET.fromstring(xml)
    assert len(list(root.iter("Part"))) == 60


def test_empty_bom_still_valid():
    xml = build_eplan_xml_deterministic([], [], {})
    ok, reason = validate_eplan_xml(xml)
    assert ok, reason
    root = ET.fromstring(xml)
    assert root.find("Project") is not None


def test_validate_rejects_malformed_xml():
    ok, reason = validate_eplan_xml("<EplanToXmlSchema><Project>")
    assert not ok
    assert "parse error" in reason


def test_validate_rejects_wrong_root():
    ok, _ = validate_eplan_xml("<NotEplan><Project/></NotEplan>")
    assert not ok


def test_validate_rejects_missing_project():
    ok, reason = validate_eplan_xml("<EplanToXmlSchema/>")
    assert not ok
    assert "Project" in reason


def test_validate_rejects_part_without_id():
    bad = (
        '<EplanToXmlSchema><Project Name="x"><Parts>'
        '<Part Type="PLC"/></Parts></Project></EplanToXmlSchema>'
    )
    ok, reason = validate_eplan_xml(bad)
    assert not ok
    assert "ID" in reason


def test_validate_rejects_connection_without_endpoints():
    bad = (
        '<EplanToXmlSchema><Project Name="x"><Connections>'
        '<Connection SourceTerminal="1"/></Connections></Project></EplanToXmlSchema>'
    )
    ok, reason = validate_eplan_xml(bad)
    assert not ok
    assert "SourcePartID" in reason


def test_validate_accepts_placeholder_document():
    """The fallback placeholder (root + Project only) passes validation."""
    placeholder = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<EplanToXmlSchema><Project Name="EE_Assistant_Project"/></EplanToXmlSchema>'
    )
    ok, reason = validate_eplan_xml(placeholder)
    assert ok, reason
