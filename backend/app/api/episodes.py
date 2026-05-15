"""Episodes listing endpoint (M3 Track A).

Pattern mirrors the org-preferences listing in ``orgs.py``: requires a
valid ``X-Volta-Org-Token``, filters by the resolved org, paginates
with ``limit`` (default 20, max 100) and ``offset`` (default 0), and
returns rows ordered ``created_at DESC``.

Track B's retrieval helpers consume the same table directly via
``EpisodicMemory`` queries; this endpoint exists for the frontend's
"记忆" tab.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import EpisodeOut
from app.db.models import EpisodicMemory, Organization
from app.db.repository import get_session
from app.middleware.org_auth import require_org

router = APIRouter(prefix="/api/orgs/me", tags=["episodes"])


@router.get("/episodes", response_model=list[EpisodeOut])
async def list_episodes(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(EpisodicMemory)
            .where(EpisodicMemory.org_id == org.id)
            .order_by(EpisodicMemory.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return rows
