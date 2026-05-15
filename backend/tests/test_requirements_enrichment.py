"""RequirementsAgent enrichment-from-org-prefs tests.

We don't drive the full LangGraph here — that would require an LLM. We
test the deterministic core (`apply_preferences`) which is the *only*
moving part introduced by the enrichment hook in `requirements_agent`.

Three cases:
  1. high-confidence pref fills a missing requirement field
  2. low-confidence pref does NOT fill (we'd rather ask the user)
  3. no org_id → requirement returned verbatim
"""
from __future__ import annotations

import uuid

import pytest

from app.core.org_prefs_keys import (
    PREF_PLC_FAMILY,
    PREF_SAFETY_LEVEL,
    PREF_ENVIRONMENT,
)
from app.core.org_prefs_service import apply_preferences
from app.db.models import Organization, OrgPreference
from app.db.repository import async_session


pytestmark = pytest.mark.asyncio


async def _make_org(name: str = "TestOrg") -> str:
    """Insert an Organization row directly via the ORM and return its id."""
    org_id = str(uuid.uuid4())
    async with async_session() as session:
        session.add(Organization(
            id=org_id,
            name=name,
            code=f"{name.lower()}-{uuid.uuid4().hex[:8]}",
            token_hash=uuid.uuid4().hex,
        ))
        await session.commit()
    return org_id


async def _seed_pref(org_id: str, key: str, value: dict, confidence: float) -> None:
    """Insert a preference row with a precise confidence value (bypasses bump)."""
    async with async_session() as session:
        session.add(OrgPreference(
            org_id=org_id,
            key=key,
            value=value,
            confidence=confidence,
            source="admin",
        ))
        await session.commit()


# 1. high-confidence prefs fill missing requirement fields ─────────────
async def test_high_confidence_pref_fills_missing_requirement_field():
    org_id = await _make_org()
    await _seed_pref(org_id, PREF_PLC_FAMILY, {"family": "S7-1200"}, confidence=0.9)
    await _seed_pref(org_id, PREF_SAFETY_LEVEL, {"level": "SIL2"}, confidence=0.8)

    requirement = {
        "machine_type": "labeling machine",
        "plc_family": None,
        "safety_level": None,
        "environment": "indoor",   # already set — must NOT be overwritten
    }

    async with async_session() as session:
        enriched = await apply_preferences(session, org_id, requirement)

    assert enriched["plc_family"] == "S7-1200"
    assert enriched["safety_level"] == "SIL2"
    # already-set field must remain the project-specific value
    assert enriched["environment"] == "indoor"
    # original dict was NOT mutated
    assert requirement["plc_family"] is None
    assert requirement["safety_level"] is None


# 2. low-confidence prefs do NOT fill ──────────────────────────────────
async def test_low_confidence_pref_does_not_fill_missing_field():
    org_id = await _make_org("LowOrg")
    await _seed_pref(org_id, PREF_ENVIRONMENT, {"env": "outdoor"}, confidence=0.4)

    requirement = {"machine_type": "x", "environment": None}

    async with async_session() as session:
        enriched = await apply_preferences(session, org_id, requirement)

    # The field stayed missing, so clarify_detector will ask the user.
    assert enriched.get("environment") in (None, "")


# 3. no org_id → returns the requirement unchanged ────────────────────
async def test_apply_preferences_returns_unchanged_when_no_org_context():
    requirement = {"machine_type": "z", "plc_family": None, "safety_level": None}

    async with async_session() as session:
        out_none = await apply_preferences(session, None, requirement)
        out_empty = await apply_preferences(session, "", requirement)

    assert out_none == requirement
    assert out_empty == requirement
