"""Detect when the analyzed requirement is missing critical engineering
parameters that should be asked back via the ClarifyCard chip picker.

Deterministic — no LLM. Runs after `analyze_requirements` parses the
user prompt. If safety level, environment, or PLC family is missing,
we build a ClarifyCard block with sensible default chips so the user
can answer in one click instead of typing.
"""
from __future__ import annotations


def _is_missing(value) -> bool:
    """Treat None, empty string, and the literal 'None' / 'null'
    strings (which LLMs sometimes emit) as missing."""
    if value is None:
        return True
    if isinstance(value, str):
        v = value.strip().lower()
        return v in ("", "none", "null", "n/a", "unknown")
    return False


# Default chip choices per missing field — chosen to cover ~90% of
# Chinese industrial use cases.
_CHOICES: dict[str, dict] = {
    "safety_level": {
        "label": "安全等级 (ISO 13849 / IEC 61508)",
        "choices": ["无安全要求", "SIL1 / PLc", "SIL2 / PLd", "SIL3 / PLe"],
    },
    "environment": {
        "label": "安装环境",
        "choices": ["室内 (IP20)", "户外/防尘 (IP54)", "潮湿/腐蚀 (IP65)", "防爆 (Ex)"],
    },
    "plc_family": {
        "label": "PLC 系列",
        "choices": ["S7-1200 (≤3轴)", "S7-1500 (多轴/高速)", "S7-200 SMART (小型)", "Allen-Bradley CompactLogix"],
    },
}

# Order matters: safety asked first because it gates safety_relay choices.
_FIELD_ORDER = ("safety_level", "environment", "plc_family")


def detect_clarification(requirement: dict | None) -> dict | None:
    """Return a `{needed: True, groups: [...]}` block when the requirement
    is missing critical fields, else None."""
    if not requirement:
        return None

    groups: list[dict] = []
    for field in _FIELD_ORDER:
        if _is_missing(requirement.get(field)):
            spec = _CHOICES[field]
            groups.append({
                "key": field,
                "label": spec["label"],
                "choices": list(spec["choices"]),
            })

    if not groups:
        return None
    return {"needed": True, "groups": groups}
