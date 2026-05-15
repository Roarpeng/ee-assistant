from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.core.clustering import render_clusters
from app.core.schemas import (
    ClusterGroup,
    ClusterProjectItem,
    ClusterResponse,
    ProjectOut,
    ProjectSearchInput,
)
from app.db.models import Project, Requirement
from app.db.repository import get_session

router = APIRouter(prefix="/api/projects", tags=["projects"])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _project_eager_options():
    """Same selectinload bundle reused by every full-detail Project query."""
    return (
        selectinload(Project.requirement).selectinload(Requirement.io_items),
        selectinload(Project.requirement).selectinload(Requirement.logic_rules),
        selectinload(Project.bom_items),
        selectinload(Project.schematic),
        selectinload(Project.code_modules),
    )


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(name: str = "Untitled", session: AsyncSession = Depends(get_session)):
    project = Project(name=name)
    session.add(project)
    await session.commit()
    result = await session.execute(
        select(Project).where(Project.id == project.id).options(*_project_eager_options())
    )
    return result.scalar()


@router.get("", response_model=list[ProjectOut])
async def list_projects(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Project).order_by(Project.updated_at.desc()))
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Search & cluster — the conversation-workspace sidebar
#
# IMPORTANT: these specific paths must be registered BEFORE the catch-all
# "/{project_id}" routes below. Otherwise FastAPI will route a POST to
# /api/projects/search into delete_project / get_project with project_id="search".
# ---------------------------------------------------------------------------


@router.post("/search", response_model=list[ClusterProjectItem])
async def search_projects(body: ProjectSearchInput, session: AsyncSession = Depends(get_session)):
    """Substring search across name + title.

    Tag-based discovery is intentionally separate (the cluster sidebar
    handles that). We use SQL ILIKE rather than a full-text index because
    the projects table stays workspace-scale (hundreds, not millions);
    add a tsvector column later if list size ever crosses ~10k.
    """
    query = (body.query or "").strip()
    limit = max(1, min(body.limit, 100))
    if not query:
        return []

    pattern = f"%{query}%"
    stmt = (
        select(Project)
        .where(or_(Project.name.ilike(pattern), Project.title.ilike(pattern)))
        .order_by(Project.updated_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/cluster", response_model=ClusterResponse)
async def cluster_projects(session: AsyncSession = Depends(get_session)):
    """Group projects by shared topic_tag — drives the workspace sidebar.

    The clustering algorithm itself lives in ``core.clustering`` so it's
    independently testable and not tied to the request layer.
    """
    result = await session.execute(select(Project).order_by(Project.updated_at.desc()))
    projects = list(result.scalars().all())

    cluster_dicts, unclustered_dicts = render_clusters(projects)
    return ClusterResponse(
        clusters=[ClusterGroup(**c) for c in cluster_dicts],
        unclustered=[ClusterProjectItem(**u) for u in unclustered_dicts],
    )


# ---------------------------------------------------------------------------
# CRUD by id (must come AFTER the static-path routes above)
# ---------------------------------------------------------------------------


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Project).where(Project.id == project_id).options(*_project_eager_options())
    )
    project = result.scalar()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Project).where(Project.id == project_id))
    project = result.scalar()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await session.delete(project)
    await session.commit()
