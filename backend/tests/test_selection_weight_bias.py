"""Selection-supervisor org-bias reordering (M2 Track B).

We don't drive the full LangGraph (would need an LLM + RAG corpus). We
test the deterministic helper ``_apply_org_bias`` directly: with a
``selection_weights`` row seeded for one (org, category, manufacturer,
model) tuple, the matching candidate must float to the top while
non-matching candidates retain their original RAG rank.
"""
from __future__ import annotations

import uuid

import pytest

from app.core.decisions_service import bump_weight
from app.core.graph.agents import _apply_org_bias
from app.db.models import Organization
from app.db.repository import async_session


pytestmark = pytest.mark.asyncio


async def _make_org(name: str = "BiasOrg") -> str:
    """Insert an Organization row and return its id (FK target for weights)."""
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


# 1. weighted candidate floats to top, others retain order ───────────────
async def test_apply_org_bias_floats_weighted_candidate_to_top():
    org_id = await _make_org()
    # Bump 1215C 5 times so it dominates the no-weight rivals.
    async with async_session() as session:
        for _ in range(5):
            await bump_weight(
                session,
                org_id=org_id,
                category="PLC_CPU",
                manufacturer="Siemens",
                model="1215C",
            )

    candidates = [
        {"category": "PLC_CPU", "manufacturer": "Siemens", "model": "1212C"},
        {"category": "PLC_CPU", "manufacturer": "Siemens", "model": "1215C"},
        {"category": "PLC_CPU", "manufacturer": "Siemens", "model": "1500"},
    ]

    biased = await _apply_org_bias(candidates, org_id)

    assert biased[0]["model"] == "1215C", "weighted candidate must come first"
    # remaining preserve their original RAG-rank order
    assert [c["model"] for c in biased[1:]] == ["1212C", "1500"]


# 2. no weights → original order preserved ───────────────────────────────
async def test_apply_org_bias_is_identity_when_no_weights_seeded():
    org_id = await _make_org("NoWeightsOrg")

    candidates = [
        {"category": "PLC_CPU", "manufacturer": "Siemens", "model": "1212C"},
        {"category": "PLC_CPU", "manufacturer": "Siemens", "model": "1215C"},
        {"category": "PLC_CPU", "manufacturer": "Siemens", "model": "1500"},
    ]

    biased = await _apply_org_bias(candidates, org_id)

    assert [c["model"] for c in biased] == ["1212C", "1215C", "1500"]
    # And the no-org-id path is a pass-through too — no DB hits.
    assert await _apply_org_bias(candidates, None) == candidates
