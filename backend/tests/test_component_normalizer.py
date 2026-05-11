from app.core.component_normalizer import normalize_component_type, normalize_protocol, normalize_property_map


def test_component_aliases():
    assert normalize_component_type('PLC') == 'plc_cpu'
    assert normalize_component_type('空开') == 'circuit_breaker'
    assert normalize_component_type('unknown-thing') == 'other'


def test_protocol_aliases():
    assert normalize_protocol('pn') == 'PROFINET'
    assert normalize_protocol('24vdc') == 'POWER_24VDC'


def test_property_map_normalization():
    out = normalize_property_map({'protocol': 'pn', 'network_protocol': 'modbus tcp'})
    assert out['protocol'] == 'PROFINET'
    assert out['network_protocol'] == 'MODBUS'


def test_unknown_protocol_defaults_unknown():
    assert normalize_protocol('weirdbus') == 'UNKNOWN'
