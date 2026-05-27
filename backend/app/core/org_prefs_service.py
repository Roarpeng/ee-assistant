"""Org preference IO with confidence-bump semantics.

`bump_or_create`:
- first time a key is seen → row inserted at confidence=0.6 (CLARIFY default)
- already exists and value matches → confidence += 0.1, capped at 1.0
- already exists and value differs → confidence resets to 0.6, value overwritten
- source defaults to 'clarify'; admin-side PUT uses source='admin'

`apply_preferences`:
- given a requirement dict with missing/None fields, fills them in
  from org_preferences, returns a NEW enriched dict (input is not mutated)
- only fills fields with confidence >= CONFIDENCE_FILL_THRESHOLD
- if org_id is None (no org context on the run), returns the requirement
  unchanged — back-compat with pre-M1 single-tenant behaviour
"""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.org_prefs_keys import REQ_FIELD_TO_PREF
from app.db.models import OrgPreference


CONFIDENCE_FILL_THRESHOLD = 0.6
CONFIDENCE_BUMP = 0.1
CONFIDENCE_INITIAL = 0.6
CONFIDENCE_MAX = 1.0


async def bump_or_create(
    session: AsyncSession,
    org_id: str,
    key: str,
    value: dict,
    source: str = "clarify",
) -> OrgPreference:
    """Insert or update an org_preferences row with confidence semantics.

    Semantics:
      - new row             -> confidence = CONFIDENCE_INITIAL (0.6)
      - same value as before -> confidence = min(MAX, current + 0.1)
      - different value     -> confidence reset to CONFIDENCE_INITIAL, value overwritten
    """
    row = (await session.execute(
        select(OrgPreference).where(
            OrgPreference.org_id == org_id,
            OrgPreference.key == key,
        )
    )).scalar_one_or_none()

    if row is None:
        row = OrgPreference(
            org_id=org_id,
            key=key,
            value=value,
            confidence=CONFIDENCE_INITIAL,
            source=source,
        )
        session.add(row)
    elif row.value == value:
        row.confidence = min(CONFIDENCE_MAX, (row.confidence or 0.0) + CONFIDENCE_BUMP)
        # touch source so admin overrides aren't quietly demoted by a clarify bump
        if source and source != row.source:
            row.source = source
    else:
        row.value = value
        row.confidence = CONFIDENCE_INITIAL
        row.source = source

    await session.commit()
    await session.refresh(row)
    return row


async def get_prefs(session: AsyncSession, org_id: str) -> dict[str, OrgPreference]:
    """Load all preferences for an org, keyed by `key`."""
    rows = (await session.execute(
        select(OrgPreference).where(OrgPreference.org_id == org_id)
    )).scalars().all()
    return {r.key: r for r in rows}


async def apply_preferences(
    session: AsyncSession,
    org_id: str | None,
    requirement: dict,
) -> dict:
    """Fill missing requirement fields from high-confidence org prefs.

    A field is only filled if:
      - the requirement currently has a missing/None/empty value for it
      - a matching org preference exists with confidence >= 0.6
      - the value-extractor returns a non-empty primitive

    Returns a NEW dict; the input is never mutated.
    """
    if not org_id or not isinstance(requirement, dict):
        return requirement

    prefs = await get_prefs(session, org_id)
    enriched = dict(requirement)

    for req_field, (pref_key, extractor) in REQ_FIELD_TO_PREF.items():
        current = enriched.get(req_field)
        if current not in (None, "", "None", "null"):
            continue
        pref = prefs.get(pref_key)
        if pref is None:
            continue
        if (pref.confidence or 0.0) < CONFIDENCE_FILL_THRESHOLD:
            continue
        try:
            v = extractor(pref.value)
        except Exception:
            log.debug("pref value JSON parse failed", exc_info=True)
            v = None
        if v:
            enriched[req_field] = v

    return enriched
