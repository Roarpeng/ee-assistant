"""Memory provenance for the BOM "ⓘ" popover (M2 Track A).

Surfaces *why* a particular (category, manufacturer, model) tuple was
recommended by aggregating signals across the memory flywheel:

* ``org_pref_match`` — does any ``org_preferences`` row reference the
  same manufacturer/family? (M1 signal)
* ``selection_weight`` — accumulated ``selection_weights.weight`` for
  the (org, category, manufacturer, model) tuple. (M2 signal)
* ``similar_episodes_count`` / ``kb_doc_hits`` — placeholders for M3,
  always 0 here.
* ``total_signals`` — count of M1+M2 signals that fired (max 2 today).

Best-effort string matching for ``org_pref_match`` — see ``_pref_matches``
below for the heuristics. A full graph-walk lookup is M3 territory.
"""
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.decisions_service import lookup_weight
from app.core.schemas import MemorySourcesOut
from app.db.models import Organization, OrgPreference, Project
from app.db.repository import get_session
from app.middleware.org_auth import require_org

router = APIRouter(
    prefix="/api/projects/{project_id}/memory-sources",
    tags=["memory-sources"],
)


def _pref_matches(pref_value: dict[str, Any], manufacturer: str, model: str) -> bool:
    """Return True if this org_preferences value plausibly references the
    given (manufacturer, model).

    The schema for ``OrgPreference.value`` is loose JSON, so we look at
    the union of common keys we've seen in M1 (``family``, ``brand``,
    ``manufacturer``, ``model``) and do case-insensitive substring
    matching. Goal is high recall for the popover signal — false
    positives here are cosmetic, not safety-critical.
    """
    if not isinstance(pref_value, dict):
        return False
    mfg = (manufacturer or "").strip().lower()
    mdl = (model or "").strip().lower()
    if not mfg and not mdl:
        return False

    # Manufacturer/brand-style hints.
    for key in ("brand", "manufacturer", "vendor"):
        v = pref_value.get(key)
        if isinstance(v, str) and mfg and v.strip().lower() == mfg:
            return True

    # Model/family-style hints. We strip trailing digits to recover the
    # family stem (so "S7-1200" → "S7-") and check whether the requested
    # model starts with that stem. This catches the common
    # "preferred_plc_family.family = 'S7-1200'" → model "S7-1215C" case
    # while staying tolerant of fully-spelled model names too.
    for key in ("family", "model", "series", "line"):
        v = pref_value.get(key)
        if not isinstance(v, str):
            continue
        raw = v.strip().lower()
        if not raw:
            continue
        if mdl and (mdl.startswith(raw) or raw.startswith(mdl)):
            return True
        stem = re.sub(r"\d+$", "", raw)
        if mdl and stem and len(stem) >= 2 and mdl.startswith(stem):
            return True
    return False


async def _ensure_project(session: AsyncSession, project_id: str) -> Project:
    project = (
        await session.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get(
    "/{category}/{manufacturer}/{model:path}",
    response_model=MemorySourcesOut,
)
async def get_memory_sources(
    project_id: str,
    category: str,
    manufacturer: str,
    model: str,
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
) -> MemorySourcesOut:
    await _ensure_project(session, project_id)

    prefs = (
        await session.execute(
            select(OrgPreference).where(OrgPreference.org_id == org.id)
        )
    ).scalars().all()
    org_pref_match = any(_pref_matches(p.value, manufacturer, model) for p in prefs)

    weight = await lookup_weight(
        session,
        org_id=org.id,
        category=category,
        manufacturer=manufacturer,
        model=model,
    )

    total = (1 if org_pref_match else 0) + (1 if weight > 0 else 0)
    return MemorySourcesOut(
        org_pref_match=org_pref_match,
        selection_weight=weight,
        similar_episodes_count=0,
        kb_doc_hits=0,
        total_signals=total,
    )
