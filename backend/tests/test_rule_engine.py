from app.core.rule_engine import validate_all, check_breaker_rating, check_sil_redundancy, check_protocol_compatibility


def test_breaker_rating_pass():
    items = [{"category": "Circuit_Breaker", "model": "3RV2021", "specifications": {"rated_current_a": 10.0}}]
    req = {"total_load_current_a": 5.0}
    violations = check_breaker_rating(items, req)
    assert len(violations) == 0


def test_breaker_rating_fail():
    items = [{"category": "Circuit_Breaker", "model": "3RV2021", "specifications": {"rated_current_a": 5.0}}]
    req = {"total_load_current_a": 6.0}
    violations = check_breaker_rating(items, req)
    assert len(violations) == 1
    assert violations[0]["rule"] == "breaker_rating"


def test_sil2_requires_redundancy():
    items = [{"category": "Safety_Relay", "model": "3SK1111"}]
    req = {"safety_level": "SIL2"}
    violations = check_sil_redundancy(items, req)
    assert len(violations) == 1


def test_sil1_no_redundancy_required():
    items = [{"category": "Safety_Relay", "model": "3SK1111"}]
    req = {"safety_level": "SIL1"}
    violations = check_sil_redundancy(items, req)
    assert len(violations) == 0


def test_protocol_mismatch():
    items = [
        {"category": "PLC_CPU", "model": "S7-1214C", "specifications": {"protocol": "PROFINET"}},
        {"category": "VFD", "model": "G120C", "specifications": {"protocol": "PROFIBUS"}},
    ]
    violations = check_protocol_compatibility(items)
    assert len(violations) == 1


def test_validate_all_aggregates():
    items = [
        {"category": "Circuit_Breaker", "model": "3RV2021", "specifications": {"rated_current_a": 5.0}},
        {"category": "Safety_Relay", "model": "3SK1111"},
        {"category": "PLC_CPU", "model": "S7-1214C", "specifications": {"protocol": "PROFINET"}},
        {"category": "VFD", "model": "G120C", "specifications": {"protocol": "PROFIBUS"}},
    ]
    req = {"total_load_current_a": 6.0, "safety_level": "SIL2"}
    violations = validate_all(items, req)
    assert len(violations) >= 3
