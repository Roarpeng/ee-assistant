from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repository import get_session
from app.db.models import Project, Requirement, BOMItem
from app.core.schemas import SelectionInput, ProjectOut, ProgressEvent
from app.core.llm_service import llm_service
from app.core.rag_engine import rag_engine
from app.core.rule_engine import validate_all
from app.core.orchestrator import orchestrator

router = APIRouter(prefix="/api/projects", tags=["selection"])


@router.post("/{project_id}/select", response_model=ProjectOut)
async def run_selection(project_id: str, body: SelectionInput, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Project).where(Project.id == project_id)
        .options(selectinload(Project.requirement).selectinload(Requirement.io_items),
                 selectinload(Project.requirement).selectinload(Requirement.logic_rules),
                 selectinload(Project.bom_items), selectinload(Project.schematic),
                 selectinload(Project.code_modules))
    )
    project = result.scalar()
    if not project or not project.requirement:
        raise HTTPException(status_code=400, detail="Project must be analyzed first")

    project.status = "selecting"
    await session.commit()

    await orchestrator.push(project_id, ProgressEvent(stage="selecting", message="Mapping component categories..."))

    req = project.requirement
    io_list = [{"tag": io.tag, "type": io.io_type, "description": io.description} for io in req.io_items]
    logic_list = [lr.description for lr in req.logic_rules]
    categories = await llm_service.map_categories(io_list, logic_list)

    await orchestrator.push(project_id, ProgressEvent(stage="selecting", message=f"Searching knowledge base for {len(categories)} categories..."))

    bom_data = []
    for cat in categories:
        chunks = await rag_engine.search(f"select {cat} for industrial automation", top_k=3, category_filter=[cat])
        if chunks:
            best = chunks[0]
            bom_data.append({
                "category": cat,
                "manufacturer": best["metadata"].get("manufacturer", "Unknown"),
                "model": best["content"][:80],
                "quantity": 1,
                "specifications": {},
                "confidence": "rag",
                "source_chunk_id": best["id"],
                "alternatives": [{"manufacturer": c["metadata"].get("manufacturer", ""), "model": c["content"][:60]} for c in chunks[1:3]],
            })
        else:
            await orchestrator.push(project_id, ProgressEvent(stage="selecting", message=f"No RAG results for {cat}, using LLM inference..."))

    req_data = {
        "safety_level": req.safety_level,
        "total_load_current_a": 0,
    }

    violations = validate_all(bom_data, req_data)
    await orchestrator.push(project_id, ProgressEvent(
        stage="selecting",
        message=f"Validation complete: {len(violations)} violations found.",
        data={"violations": violations},
    ))

    for item_data in bom_data:
        session.add(BOMItem(project_id=project_id, **item_data))
    await session.commit()

    await session.refresh(project)
    project.status = "ready"
    await session.commit()

    await orchestrator.push(project_id, ProgressEvent(stage="ready", message="Component selection complete."))
    return project
