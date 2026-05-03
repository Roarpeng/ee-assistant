from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repository import get_session
from app.db.models import Project, Requirement, IOItem, LogicRule, BOMItem, Schematic, STModule
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


@router.post("/{project_id}/analyze-v2", response_model=ProjectOut)
async def analyze_project_v2(project_id: str, body: RequirementInput, session: AsyncSession = Depends(get_session)):
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

    final_state = await orchestrator.run_graph_analysis(project_id, body.text)

    req_data = final_state.get("requirement", {})
    req = Requirement(
        project_id=project_id,
        machine_type=req_data.get("machine_type"),
        safety_level=req_data.get("safety_level"),
        environment=req_data.get("environment"),
        plc_family=req_data.get("plc_family"),
        raw_text=body.text,
    )
    session.add(req)
    await session.flush()

    for io in req_data.get("io_list", []):
        session.add(IOItem(requirement_id=req.id, tag=io["tag"], io_type=io["type"], description=io["description"]))
    for rule in req_data.get("control_logic", []):
        session.add(LogicRule(requirement_id=req.id, description=rule))

    for item_data in final_state.get("bom_items", []):
        bom_kwargs = {
            "category": item_data.get("category", ""),
            "manufacturer": item_data.get("manufacturer", "Unknown"),
            "model": item_data.get("model", ""),
            "quantity": item_data.get("quantity", 1),
            "specifications": item_data.get("specifications", {}),
            "confidence": item_data.get("confidence", "rag"),
            "source_chunk_id": item_data.get("source_chunk_id"),
            "alternatives": item_data.get("alternatives", []),
        }
        session.add(BOMItem(project_id=project_id, **bom_kwargs))

    mermaid = final_state.get("mermaid_code")
    if mermaid:
        session.add(Schematic(project_id=project_id, mermaid_code=mermaid))

    for i, mod in enumerate(final_state.get("st_modules", [])):
        session.add(STModule(
            project_id=project_id,
            name=mod.get("name", ""),
            module_type=mod.get("module_type", "FC"),
            code=mod.get("code", ""),
            sort_order=mod.get("sort_order", i),
        ))

    await session.commit()
    await session.refresh(project)
    return project
