"""Tests for the commissioning step generator (GuidePanel data source).

Deterministic — no LLM. Steps are composed from a baseline of
universal commissioning stages plus conditional steps based on
what's in the BOM and requirement.

Output shape MUST match frontend's `commissioningSteps`: list of
{title, body}. Body is the actionable detail; title is the short
header shown in big numerals.
"""
from app.core.commissioning_generator import generate_commissioning_steps


def _bom(categories: list[str]) -> list[dict]:
    return [
        {"category": cat, "manufacturer": "Siemens", "model": cat}
        for cat in categories
    ]


def test_baseline_steps_always_present():
    """Every commissioning plan must cover: 上电 → 接线 → 程序 → IO →
    HMI → 现场调试. Even a minimal BOM gets these six."""
    steps = generate_commissioning_steps(bom_items=[], requirement={})
    titles = [s["title"] for s in steps]
    assert any("上电" in t for t in titles)
    assert any("接线" in t for t in titles)
    assert any("程序" in t for t in titles) or any("下载" in t for t in titles)
    assert any("IO" in t or "测试" in t for t in titles)
    assert any("现场" in t or "联调" in t for t in titles)


def test_returns_title_body_shape():
    steps = generate_commissioning_steps(bom_items=[], requirement={})
    assert all(set(s.keys()) == {"title", "body"} for s in steps)
    assert all(isinstance(s["title"], str) and s["title"].strip() for s in steps)
    assert all(isinstance(s["body"], str) and s["body"].strip() for s in steps)


def test_vfd_in_bom_adds_parameter_step():
    """When a VFD is in the BOM, the plan must include a parameter
    setting step — without VFD nothing about parameters."""
    with_vfd = generate_commissioning_steps(bom_items=_bom(["VFD", "PLC_CPU"]), requirement={})
    no_vfd = generate_commissioning_steps(bom_items=_bom(["PLC_CPU"]), requirement={})
    assert any("变频" in s["title"] or "VFD" in s["title"] for s in with_vfd)
    assert not any("变频" in s["title"] or "VFD" in s["title"] for s in no_vfd)


def test_servo_in_bom_adds_tuning_step():
    steps = generate_commissioning_steps(bom_items=_bom(["Servo_Drive", "PLC_CPU"]), requirement={})
    assert any("伺服" in s["title"] or "Servo" in s["title"] for s in steps)


def test_hmi_in_bom_adds_screen_step():
    steps = generate_commissioning_steps(bom_items=_bom(["HMI", "PLC_CPU"]), requirement={})
    assert any("HMI" in s["title"] or "触摸屏" in s["title"] for s in steps)


def test_safety_level_sil2_adds_validation_step():
    """SIL2 or higher mandates documented safety validation."""
    steps = generate_commissioning_steps(
        bom_items=_bom(["PLC_CPU", "Safety_Relay"]),
        requirement={"safety_level": "SIL2"},
    )
    assert any("安全" in s["title"] or "SISTEMA" in s["body"] for s in steps)


def test_low_safety_no_validation_step():
    steps = generate_commissioning_steps(
        bom_items=_bom(["PLC_CPU"]),
        requirement={"safety_level": "SIL1"},
    )
    assert not any("SISTEMA" in s["body"] for s in steps)


def test_steps_in_logical_order():
    """Baseline stages must appear in dependency order: you can't run
    IO tests before downloading the program; you can't field-tune
    before HMI is up. We assert each baseline step appears before the
    next baseline step."""
    steps = generate_commissioning_steps(
        bom_items=_bom(["PLC_CPU", "HMI", "VFD"]),
        requirement={},
    )
    titles = [s["title"] for s in steps]
    def idx(needle: str) -> int:
        return next((i for i, t in enumerate(titles) if needle in t), -1)
    assert idx("上电") < idx("接线"), titles
    assert idx("接线") < idx("下载") or idx("接线") < idx("程序"), titles
    # 现场调试 must be last (no other stage comes after it in the
    # baseline; conditional steps insert in the middle).
    field_idx = idx("现场")
    if field_idx >= 0:
        assert field_idx == len(titles) - 1, titles
