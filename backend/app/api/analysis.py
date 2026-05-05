from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
import json as json_module

from app.db.repository import get_session
from app.db.models import Project, Requirement, IOItem, LogicRule, BOMItem, Schematic, STModule
from app.core.schemas import RequirementInput, ProjectOut, ResumeRequest
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


@router.post("/{project_id}/analyze-v2")
async def analyze_project_v2(project_id: str, body: RequirementInput, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    async def event_generator():
        final_state = None
        try:
            async for event in orchestrator.stream_graph_analysis(
                project_id, body.text,
                llm_config=body.llm_config,
                embedding_config=body.embedding_config,
                history=body.history,
            ):
                if event.get("done"):
                    final_state = event.get("payload")
                yield f"data: {json_module.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json_module.dumps({'error': str(e)})}\n\n"
            return

        if final_state:
            from app.db.repository import async_session
            async with async_session() as db:
                req_data = final_state.get("requirement", {})
                if req_data:
                    req = Requirement(
                        project_id=project_id,
                        machine_type=req_data.get("machine_type"),
                        safety_level=req_data.get("safety_level"),
                        environment=req_data.get("environment"),
                        plc_family=req_data.get("plc_family"),
                        raw_text=body.text,
                    )
                    db.add(req)
                    await db.flush()

                    for io in req_data.get("io_list", []):
                        db.add(IOItem(requirement_id=req.id, tag=io["tag"], io_type=io["type"], description=io["description"]))
                    for rule in req_data.get("control_logic", []):
                        db.add(LogicRule(requirement_id=req.id, description=rule))

                for item_data in final_state.get("bom_items", []):
                    db.add(BOMItem(
                        project_id=project_id,
                        category=item_data.get("category", ""),
                        manufacturer=item_data.get("manufacturer", "Unknown"),
                        model=item_data.get("model", ""),
                        quantity=item_data.get("quantity", 1),
                        specifications=item_data.get("specifications", {}),
                        confidence=item_data.get("confidence", "rag"),
                        source_chunk_id=item_data.get("source_chunk_id"),
                        alternatives=item_data.get("alternatives", []),
                    ))

                mermaid = final_state.get("mermaid_code")
                if mermaid:
                    # If we had a topology column, we'd save it here. 
                    # For now, ensure it's in the SSE response (already handled by event_generator)
                    db.add(Schematic(project_id=project_id, mermaid_code=mermaid))

                for i, mod in enumerate(final_state.get("st_modules", []) or []):
                    db.add(STModule(
                        project_id=project_id,
                        name=mod.get("name", f"Module_{i}"),
                        module_type=mod.get("module_type", "FC"),
                        code=mod.get("code", ""),
                        sort_order=i
                    ))

                await db.execute(
                    update(Project).where(Project.id == project_id).values(status="ready")
                )
                await db.commit()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/{project_id}/resume")
async def resume_project_analysis(project_id: str, body: ResumeRequest, session: AsyncSession = Depends(get_session)):
    """Resume a paused LangGraph workflow with human-provided component selections.

    Called after the selection_supervisor node interrupts with STATUS: NOT_FOUND.
    The body.manual_selections are passed as the interrupt() resume value.
    """
    result = await session.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    async def event_generator():
        final_state = None
        try:
            async for event in orchestrator.resume_graph_analysis(
                project_id,
                {"manual_selections": body.manual_selections},
            ):
                if event.get("done"):
                    final_state = event.get("payload")
                yield f"data: {json_module.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json_module.dumps({'error': str(e)})}\n\n"
            return

        if final_state:
            from app.db.repository import async_session
            async with async_session() as db:
                req_data = final_state.get("requirement", {})
                if req_data:
                    req = Requirement(
                        project_id=project_id,
                        machine_type=req_data.get("machine_type"),
                        safety_level=req_data.get("safety_level"),
                        environment=req_data.get("environment"),
                        plc_family=req_data.get("plc_family"),
                        raw_text="[Resumed with human selection]",
                    )
                    db.add(req)
                    await db.flush()

                    for io in req_data.get("io_list", []):
                        db.add(IOItem(requirement_id=req.id, tag=io["tag"], io_type=io["type"], description=io["description"]))
                    for rule in req_data.get("control_logic", []):
                        db.add(LogicRule(requirement_id=req.id, description=rule))

                for item_data in final_state.get("bom_items", []):
                    db.add(BOMItem(
                        project_id=project_id,
                        category=item_data.get("category", ""),
                        manufacturer=item_data.get("manufacturer", "Unknown"),
                        model=item_data.get("model", ""),
                        quantity=item_data.get("quantity", 1),
                        specifications=item_data.get("specifications", {}),
                        confidence=item_data.get("confidence", "rag"),
                        source_chunk_id=item_data.get("source_chunk_id"),
                        alternatives=item_data.get("alternatives", []),
                    ))

                mermaid = final_state.get("mermaid_code")
                if mermaid:
                    db.add(Schematic(project_id=project_id, mermaid_code=mermaid))

                for i, mod in enumerate(final_state.get("st_modules", []) or []):
                    db.add(STModule(
                        project_id=project_id,
                        name=mod.get("name", f"Module_{i}"),
                        module_type=mod.get("module_type", "FC"),
                        code=mod.get("code", ""),
                        sort_order=i
                    ))

                await db.execute(
                    update(Project).where(Project.id == project_id).values(status="ready")
                )
                await db.commit()

    return StreamingResponse(event_generator(), media_type="text/event-stream")
