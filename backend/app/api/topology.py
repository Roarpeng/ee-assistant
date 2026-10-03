from datetime import UTC, datetime

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import TopologySnapshotInput, TopologyOut
from app.db.models import Project, ProjectTopology, Requirement
from app.db.repository import get_session

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["topology"])


@router.get("/{project_id}/topology", response_model=TopologyOut)
async def get_project_topology(project_id: str, session: AsyncSession = Depends(get_session)):
    project = await _get_project(project_id, session)
    topology = await _get_latest_topology(project.id, session)
    if not topology:
        raise HTTPException(status_code=404, detail="Topology not found")
    return topology


@router.post("/{project_id}/topology", response_model=TopologyOut, status_code=201)
async def save_project_topology(project_id: str, body: TopologySnapshotInput, session: AsyncSession = Depends(get_session)):
    project = await _get_project(project_id, session)
    latest = await _get_latest_topology(project.id, session)
    topology = ProjectTopology(
        project_id=project.id,
        version=(latest.version + 1) if latest else 1,
        status="draft",
        source=body.source,
        snapshot=body.snapshot,
    )
    session.add(topology)
    await session.commit()
    await session.refresh(topology)
    return topology


@router.post("/{project_id}/topology/confirm", response_model=TopologyOut)
async def confirm_project_topology(
    project_id: str,
    body: dict | None = None,
    session: AsyncSession = Depends(get_session),
):
    project = await _get_project(project_id, session)
    topology_id = body.get("topology_id") if body else None
    topology = (
        await _get_topology_by_id(project.id, topology_id, session)
        if topology_id
        else await _get_latest_topology(project.id, session)
    )
    if not topology:
        raise HTTPException(status_code=404, detail="Topology not found")

    topology.status = "confirmed"
    topology.confirmed_at = datetime.now(UTC).replace(tzinfo=None)
    project.status = "ready"
    await session.commit()
    await session.refresh(topology)

    # ── derivation hook: rebuild circuit-level schematic pages ──
    # Best-effort inline derivation (pure local compute, no LLM): a
    # failure must never break confirmation — the user can always hit
    # POST /schematic/pages to regenerate manually.
    try:
        from app.api.schematic_v2 import derive_and_store_schematic
        full = (
            await session.execute(
                select(Project).where(Project.id == project.id)
                .options(selectinload(Project.bom_items),
                         selectinload(Project.requirement).selectinload(Requirement.io_items),
                         selectinload(Project.requirement).selectinload(Requirement.logic_rules))
            )
        ).scalar()
        await derive_and_store_schematic(session, full)
    except HTTPException as e:
        if e.status_code == 404:
            log.info("[topology.confirm] schematic derivation skipped: %s", e.detail)
        else:
            log.warning("[topology.confirm] schematic derivation failed: %s", e.detail)
    except Exception as e:  # noqa: BLE001 — deliberate guard rail
        log.warning("[topology.confirm] schematic derivation failed (non-fatal): %r", e)

    return topology


async def _get_project(project_id: str, session: AsyncSession) -> Project:
    result = await session.execute(select(Project).where(Project.id == project_id))
    project = result.scalar()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _get_latest_topology(project_id: str, session: AsyncSession) -> ProjectTopology | None:
    result = await session.execute(
        select(ProjectTopology)
        .where(ProjectTopology.project_id == project_id)
        .order_by(ProjectTopology.version.desc())
    )
    return result.scalars().first()


async def _get_topology_by_id(
    project_id: str,
    topology_id: str,
    session: AsyncSession,
) -> ProjectTopology | None:
    result = await session.execute(
        select(ProjectTopology).where(
            ProjectTopology.project_id == project_id,
            ProjectTopology.id == topology_id,
        )
    )
    return result.scalar()
