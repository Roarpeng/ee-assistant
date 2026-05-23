from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repository import get_session
from app.db.models import Project, Requirement, STModule
from app.core.schemas import CodegenInput, ProjectOut, ProgressEvent
from app.core.llm_service import llm_service
from app.core.orchestrator import orchestrator

router = APIRouter(prefix="/api/projects", tags=["codegen"])


@router.post("/{project_id}/codegen", response_model=ProjectOut)
async def generate_code(project_id: str, body: CodegenInput, session: AsyncSession = Depends(get_session)):
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
    if not project.requirement:
        return project

    project.status = "generating_code"
    await session.commit()

    await orchestrator.push(project_id, ProgressEvent(stage="generating_code", message="Generating ST code..."))

    req_data = {
        "machine_type": project.requirement.machine_type,
        "safety_level": project.requirement.safety_level,
        "plc_family": project.requirement.plc_family,
        "io_list": [{"tag": io.tag, "type": io.io_type, "description": io.description} for io in project.requirement.io_items],
        "control_logic": [lr.description for lr in project.requirement.logic_rules],
    }
    bom_list = [{"category": i.category, "manufacturer": i.manufacturer, "model": i.model} for i in project.bom_items]

    modules = await llm_service.generate_st_code(req_data, bom_list)

    for old in project.code_modules:
        await session.delete(old)

    for i, mod in enumerate(modules):
        session.add(STModule(
            project_id=project_id,
            name=mod["name"],
            module_type=mod["module_type"],
            code=mod["code"],
            sort_order=mod.get("sort_order", i),
        ))

    project.status = "done"
    await session.commit()

    await orchestrator.push(project_id, ProgressEvent(
        stage="done",
        message=f"Generated {len(modules)} ST code modules.",
        data={"module_count": len(modules)},
    ))

    await session.refresh(project)
    return project
