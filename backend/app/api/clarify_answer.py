"""Clarify-answer writeback endpoint.

When the user picks a chip in a ClarifyCard, the frontend POSTs the
{group_key: chosen_value} map here. We persist each answer into the
org's preference store with `bump_or_create`, so subsequent projects
from the same org get the field auto-filled in `requirements_agent`.

Group keys come from `clarification_detector.detect_clarification`:
    "safety_level", "environment", "plc_family"

We also accept a couple of forward-compatible keys ("voltage",
"hmi_brand") so that if the clarification catalogue grows later the
writeback layer doesn't need a coordinated change.

Unknown group keys are silently ignored — the endpoint never 4xx's on
shape mismatches because the frontend has to keep working while the
catalogue evolves.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.org_prefs_keys import (
    PREF_PLC_FAMILY,
    PREF_SAFETY_LEVEL,
    PREF_ENVIRONMENT,
    PREF_VOLTAGE,
    PREF_HMI_BRAND,
)
from app.core.org_prefs_service import bump_or_create
from app.db.models import Organization
from app.db.repository import get_session
from app.middleware.org_auth import require_org


router = APIRouter(prefix="/api/projects/{project_id}/clarify", tags=["clarify"])


def _voltage_value(raw: str) -> dict:
    """Coerce a chip-picker voltage answer into the {volts: int|str} shape."""
    s = (raw or "").strip()
    digits = "".join(c for c in s if c.isdigit())
    if digits:
        try:
            return {"volts": int(digits)}
        except ValueError:
            pass
    return {"volts": s}


# Map: ClarifyCard group_key  ->  (preference_key, chip_value -> stored_value)
#
# The first three keys MUST match `clarification_detector._FIELD_ORDER`.
# The last two are forward-compatible — they let a future detector
# extension write back without an API change.
_GROUP_TO_PREF: dict[str, tuple[str, callable]] = {
    "safety_level": (PREF_SAFETY_LEVEL, lambda v: {"level": v}),
    "plc_family": (PREF_PLC_FAMILY, lambda v: {"family": v}),
    "environment": (PREF_ENVIRONMENT, lambda v: {"env": v}),
    "voltage": (PREF_VOLTAGE, _voltage_value),
    "hmi_brand": (PREF_HMI_BRAND, lambda v: {"brand": v}),
}


class ClarifyAnswer(BaseModel):
    answers: dict[str, str]   # {group_key: chosen_chip_value}


@router.post("/answer")
async def submit_clarify(
    project_id: str,
    body: ClarifyAnswer,
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
):
    """Persist each answer into org_preferences via `bump_or_create`.

    Returns the list of preference rows that were written (echoed back
    so the frontend can refresh its local preferences table without a
    follow-up GET).
    """
    written: list[dict] = []
    for group_key, choice in (body.answers or {}).items():
        mapped = _GROUP_TO_PREF.get(group_key)
        if mapped is None:
            continue
        if choice in (None, ""):
            continue
        pref_key, to_value = mapped
        row = await bump_or_create(
            session=session,
            org_id=org.id,
            key=pref_key,
            value=to_value(choice),
            source="clarify",
        )
        written.append({
            "key": row.key,
            "value": row.value,
            "confidence": row.confidence,
        })
    return {"project_id": project_id, "written": written}
