"""Tests for the deterministic clarification-needs detector.

Pure function — no LLM. Walks the parsed requirement and returns a
ClarifyCard-shaped block when critical engineering parameters are
missing or ambiguous. The frontend renders the groups as chip-pickers
under the assistant message.
"""
from app.core.clarification_detector import detect_clarification


def test_complete_requirement_returns_none():
    """When all four critical params are present, no clarification
    needed — the agent has enough info to proceed."""
    req = {
        "machine_type": "Conveyor Belt",
        "safety_level": "SIL2",
        "environment": "indoor",
        "plc_family": "S7-1200",
    }
    assert detect_clarification(req) is None


def test_missing_safety_level_asks():
    """The most common gap — users almost never volunteer SIL/PLd
    in the initial prompt."""
    req = {
        "machine_type": "Conveyor Belt",
        "safety_level": None,
        "environment": "indoor",
        "plc_family": "S7-1200",
    }
    result = detect_clarification(req)
    assert result is not None
    groups = result["groups"]
    keys = [g["key"] for g in groups]
    assert "safety_level" in keys
    # Choices include the common standards.
    safety_group = next(g for g in groups if g["key"] == "safety_level")
    assert any("SIL2" in c for c in safety_group["choices"])
    assert any("PLd" in c or "PL d" in c for c in safety_group["choices"])


def test_missing_environment_asks():
    req = {
        "machine_type": "Pump",
        "safety_level": "SIL1",
        "environment": None,
        "plc_family": "S7-1200",
    }
    result = detect_clarification(req)
    assert result is not None
    keys = [g["key"] for g in result["groups"]]
    assert "environment" in keys


def test_missing_plc_family_asks():
    req = {
        "machine_type": "Slide table",
        "safety_level": "SIL1",
        "environment": "indoor",
        "plc_family": None,
    }
    result = detect_clarification(req)
    assert result is not None
    keys = [g["key"] for g in result["groups"]]
    assert "plc_family" in keys


def test_multiple_missing_combined_into_one_block():
    """When several fields are missing, return ONE clarification block
    with multiple groups — better UX than spamming separate cards."""
    req = {"machine_type": "Mixer", "safety_level": None, "environment": None, "plc_family": None}
    result = detect_clarification(req)
    assert result is not None
    assert len(result["groups"]) == 3


def test_groups_have_correct_shape():
    req = {"safety_level": None}
    result = detect_clarification(req)
    assert result is not None
    for g in result["groups"]:
        assert set(g.keys()) == {"key", "label", "choices"}
        assert g["label"]  # display label, non-empty
        assert len(g["choices"]) >= 2  # at least two options for a chip picker


def test_explicit_none_string_treated_as_missing():
    """Sometimes the LLM returns the literal string 'None' instead of
    null — treat that as missing too."""
    req = {"safety_level": "None"}
    result = detect_clarification(req)
    assert result is not None


def test_empty_string_treated_as_missing():
    req = {"safety_level": ""}
    result = detect_clarification(req)
    assert result is not None


def test_includes_needed_flag():
    """Schema contract — `needed: True` so the frontend can branch
    cleanly without inspecting the groups."""
    req = {"safety_level": None}
    result = detect_clarification(req)
    assert result["needed"] is True
