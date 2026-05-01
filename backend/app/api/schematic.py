from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repository import get_session
from app.db.models import Project, Requirement, Schematic
from app.core.schemas import SchematicInput, ProjectOut, ProgressEvent
from app.core.llm_service import llm_service
from app.core.orchestrator import orchestrator

router = APIRouter(prefix="/api/projects", tags=["schematic"])


@router.post("/{project_id}/schematic", response_model=ProjectOut)
async def generate_schematic(project_id: str, body: SchematicInput, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Project).where(Project.id == project_id)
        .options(selectinload(Project.requirement).selectinload(Requirement.io_items),
                 selectinload(Project.bom_items), selectinload(Project.schematic),
                 selectinload(Project.code_modules))
    )
    project = result.scalar()
    if not project or not project.requirement or not project.bom_items:
        raise HTTPException(status_code=400, detail="Project must have requirements and BOM first")

    project.status = "generating_schematic"
    await session.commit()

    await orchestrator.push(project_id, ProgressEvent(stage="generating_schematic", message="Generating block diagram..."))

    bom_list = [{"category": i.category, "manufacturer": i.manufacturer, "model": i.model} for i in project.bom_items]
    req_data = {
        "machine_type": project.requirement.machine_type,
        "safety_level": project.requirement.safety_level,
    }

    mermaid_code = await llm_service.generate_schematic_mermaid(bom_list, req_data)

    existing = project.schematic
    if existing:
        existing.mermaid_code = mermaid_code
    else:
        session.add(Schematic(project_id=project_id, mermaid_code=mermaid_code, svg_data=None))

    project.status = "ready"
    await session.commit()

    await orchestrator.push(project_id, ProgressEvent(
        stage="done",
        message="Schematic generation complete.",
        data={"mermaid_code": mermaid_code},
    ))

    await session.refresh(project)
    return project
