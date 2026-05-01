from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repository import get_session
from app.db.models import Project, Requirement
from app.core.schemas import RequirementInput, ProjectOut
from app.core.orchestrator import orchestrator

router = APIRouter(prefix="/api/projects", tags=["analysis"])


@router.post("/{project_id}/analyze", response_model=ProjectOut)
async def analyze_project(project_id: str, body: RequirementInput, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Project).where(Project.id == project_id)
        .options(selectinload(Project.requirement).selectinload(Requirement.io_items),
                 selectinload(Project.requirement).selectinload(Requirement.logic_rules),
                 selectinload(Project.bom_items), selectinload(Project.schematic),
                 selectinload(Project.code_modules))
    )
    project = result.scalar()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.status = "analyzing"
    await session.commit()

    await orchestrator.run_analysis(project_id, body.text, session)

    await session.refresh(project)
    project.status = "ready"
    await session.commit()

    return project
