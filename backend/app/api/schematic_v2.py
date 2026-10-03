"""Circuit-level schematic API (v2) — derive / list / read pages.

`derive_and_store_schematic` is the single derivation entry shared by
three callers:

- `POST /api/projects/{id}/schematic/pages`   (manual regenerate)
- `POST /api/projects/{id}/topology/confirm`  (hook, best-effort)
- `api/analysis.save_to_db`                   (after analyze-v2 runs)

Inputs: latest confirmed topology (falls back to latest draft) + BOM +
requirement; the wiring table is recomputed deterministically so the
schematic and WiringPanel can never disagree. Rendered SVGs are cached
in the same rows.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schematic import SchematicBuildError, build_schematic, render_document
from app.core.schematic.ir import SchematicPage as SchematicPageIR
from app.core.schematic.svg_render import render_page
from app.core.wiring_generator import generate_wiring
from app.db.models import BOMItem, Project, Requirement, SchematicPageRow, ProjectTopology
from app.db.repository import get_session

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["schematic-v2"])


class SchematicPageOut(BaseModel):
    page_no: int
    kind: str
    title_zh: str
    svg: str | None = None
    notes: list[str] = []
    cross_refs: list[dict] = []


class SchematicPagesOut(BaseModel):
    project_id: str
    source_topology_version: int
    pages: list[SchematicPageOut]


# ── derivation core ─────────────────────────────────────────────────────

async def _latest_topology(session: AsyncSession, project_id: str) -> ProjectTopology | None:
    confirmed = (
        await session.execute(
            select(ProjectTopology)
            .where(ProjectTopology.project_id == project_id, ProjectTopology.status == "confirmed")
            .order_by(ProjectTopology.version.desc())
        )
    ).scalars().first()
    if confirmed:
        return confirmed
    return (
        await session.execute(
            select(ProjectTopology)
            .where(ProjectTopology.project_id == project_id)
            .order_by(ProjectTopology.version.desc())
        )
    ).scalars().first()


def _bom_to_dicts(project: Project) -> list[dict]:
    out = []
    for i in project.bom_items or []:
        out.append({
            "id": i.id,
            "category": i.category,
            "manufacturer": i.manufacturer,
            "model": i.model,
            "specifications": i.specifications or {},
        })
    return out


def _requirement_dict(project: Project) -> dict:
    r = project.requirement
    if not r:
        return {}
    return {
        "machine_type": r.machine_type,
        "safety_level": r.safety_level,
        "io_list": [
            {"tag": io.tag, "type": io.io_type, "description": io.description}
            for io in (r.io_items or [])
        ],
        "control_logic": [lr.description for lr in (r.logic_rules or [])],
    }


async def derive_and_store_schematic(session: AsyncSession, project: Project) -> list[SchematicPageRow]:
    """Derive circuit pages from topology+BOM and replace stored rows.

    Raises SchematicBuildError on IR validation failure (HTTP 422 at the
    API layer) and HTTPException(404) when no topology exists yet.
    """
    topo = await _latest_topology(session, project.id)
    if topo is None:
        raise HTTPException(status_code=404, detail="No topology saved for project")

    await session.refresh(project, ["bom_items", "requirement"])
    bom_dicts = _bom_to_dicts(project)
    req = _requirement_dict(project)
    wiring_rows = generate_wiring(bom_dicts, req.get("io_list") or [])

    doc = build_schematic(
        topo.snapshot if isinstance(topo.snapshot, dict) else {},
        bom_dicts,
        req,
        wiring_rows,
        project_id=project.id,
        topology_version=topo.version,
    )
    doc.project_name = project.title or project.name or ""

    svg_by_page = dict(render_document(doc))

    await session.execute(delete(SchematicPageRow).where(SchematicPageRow.project_id == project.id))
    rows: list[SchematicPageRow] = []
    for page in doc.pages:
        rows.append(SchematicPageRow(
            project_id=project.id,
            page_no=page.page_no,
            kind=page.kind,
            title_zh=page.title_zh,
            ir=page.model_dump(mode="json"),
            svg=svg_by_page.get(page.page_no),
        ))
        session.add(rows[-1])
    await session.commit()
    log.info("[schematic_v2] derived %d pages for project %s (topology v%s)",
             len(rows), project.id, topo.version)
    return rows


def _row_to_out(row: SchematicPageRow, with_svg: bool = True) -> SchematicPageOut:
    ir = row.ir if isinstance(row.ir, dict) else {}
    return SchematicPageOut(
        page_no=row.page_no,
        kind=row.kind,
        title_zh=row.title_zh,
        svg=row.svg if with_svg else None,
        notes=ir.get("notes") or [],
        cross_refs=ir.get("cross_refs") or [],
    )


# ── endpoints ───────────────────────────────────────────────────────────

@router.post("/{project_id}/schematic/pages", response_model=SchematicPagesOut)
async def regenerate_schematic_pages(
    project_id: str,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Project).where(Project.id == project_id)
        .options(selectinload(Project.bom_items),
                 selectinload(Project.requirement).selectinload(Requirement.io_items),
                 selectinload(Project.requirement).selectinload(Requirement.logic_rules))
    )
    project = result.scalar()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        rows = await derive_and_store_schematic(session, project)
    except SchematicBuildError as e:
        raise HTTPException(status_code=422, detail=f"Schematic IR invalid: {e}")
    topo = await _latest_topology(session, project_id)
    return SchematicPagesOut(
        project_id=project_id,
        source_topology_version=topo.version if topo else 0,
        pages=[_row_to_out(r) for r in sorted(rows, key=lambda r: r.page_no)],
    )


@router.get("/{project_id}/schematic/pages", response_model=SchematicPagesOut)
async def list_schematic_pages(
    project_id: str,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(SchematicPageRow).where(SchematicPageRow.project_id == project_id)
        .order_by(SchematicPageRow.page_no)
    )
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="No schematic pages derived yet")
    return SchematicPagesOut(project_id=project_id, source_topology_version=0, pages=[_row_to_out(r) for r in rows])


@router.get("/{project_id}/schematic/pages/{page_no}", response_model=SchematicPageOut)
async def get_schematic_page(
    project_id: str,
    page_no: int,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(SchematicPageRow).where(
            SchematicPageRow.project_id == project_id,
            SchematicPageRow.page_no == page_no,
        )
    )
    row = result.scalar()
    if not row:
        raise HTTPException(status_code=404, detail="Page not found")
    return _row_to_out(row)


def render_page_from_ir(ir: dict, doc_meta: dict) -> str:
    """Render one page's stored IR back to SVG (used by export paths)."""
    page = SchematicPageIR.model_validate(ir)
    from app.core.schematic.ir import SchematicDocument
    doc = SchematicDocument(**doc_meta)
    return render_page(page, doc)
