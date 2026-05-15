"""Admin/org-scoped memory consolidation endpoints (M3 Track B).

Two routes:

* ``POST /api/admin/consolidate-memory`` — kicks off a sleep-time
  consolidation pass for the calling org. Body: ``{days?: int = 7}``.
  Returns ``201`` with the new report id + a short summary block. The
  "admin" prefix is historical — there's no separate admin role today,
  ``require_org`` is the only gate.
* ``GET /api/orgs/me/memory-reports`` — lists the most-recent reports
  for the calling org, newest first.

Both endpoints depend on ``EpisodicMemory`` / ``WeeklyMemoryReport``
being present in ``models.py`` (M3 Track A) and on the ``ReportOut``
schema (M3 Track A as well). Track B owns just the routing + the call
into ``consolidation_service.consolidate``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.consolidation_service import consolidate
from app.core.schemas import ReportOut
from app.db.models import Organization, WeeklyMemoryReport
from app.db.repository import get_session
from app.middleware.org_auth import require_org


router = APIRouter(tags=["memory-admin"])


class ConsolidateIn(BaseModel):
    """Body for ``POST /api/admin/consolidate-memory``."""

    days: int = Field(default=7, ge=1, le=90)


class ConsolidateSummary(BaseModel):
    new_rules: list[dict] = Field(default_factory=list)
    revisions: list[dict] = Field(default_factory=list)
    gaps: list[dict] = Field(default_factory=list)
    metrics: dict = Field(default_factory=dict)


class ConsolidateOut(BaseModel):
    report_id: str
    summary: ConsolidateSummary


@router.post(
    "/api/admin/consolidate-memory",
    response_model=ConsolidateOut,
    status_code=status.HTTP_201_CREATED,
)
async def consolidate_now(
    body: ConsolidateIn = ConsolidateIn(),
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
) -> ConsolidateOut:
    report = await consolidate(session, org_id=org.id, days=body.days)
    return ConsolidateOut(
        report_id=report.id,
        summary=ConsolidateSummary(
            new_rules=report.new_rules or [],
            revisions=report.revisions or [],
            gaps=report.gaps or [],
            metrics=report.metrics or {},
        ),
    )


@router.get(
    "/api/orgs/me/memory-reports",
    response_model=list[ReportOut],
)
async def list_reports(
    limit: int = 10,
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
) -> list[WeeklyMemoryReport]:
    capped = max(1, min(limit, 100))
    rows = (
        await session.execute(
            select(WeeklyMemoryReport)
            .where(WeeklyMemoryReport.org_id == org.id)
            .order_by(WeeklyMemoryReport.created_at.desc())
            .limit(capped)
        )
    ).scalars().all()
    return list(rows)
