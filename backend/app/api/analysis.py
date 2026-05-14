import asyncio
import traceback
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select, update
from sqlalchemy.orm import selectinload
import json as json_module

from app.db.repository import get_session
from app.db.models import Project, Requirement, IOItem, LogicRule, BOMItem, Schematic, STModule
from app.core.schemas import ChatInput, RequirementInput, ProjectOut, ResumeRequest
from app.core.chat_orchestrator import chat_orchestrator
from app.core.orchestrator import orchestrator

router = APIRouter(prefix="/api/projects", tags=["analysis"])


async def save_to_db(
    session: AsyncSession,
    project_id: str,
    payload: dict,
    raw_text: str = "",
) -> None:
    """Idempotent project persistence for analyze-v2 / resume.

    Re-running analysis on the same project_id is supported:
    - requirements / schematics are 1:1 with a UNIQUE(project_id)
      constraint, so we delete-then-insert.
    - bom_items / st_modules are append-only by schema but
      logically "the latest run wins", so we wipe-and-reinsert.
    - io_items / logic_rules don't have ON DELETE CASCADE at the
      DB level (only ORM cascade), so we delete them explicitly
      before deleting the parent Requirement to satisfy the FK.

    Commits on success. Caller is expected to wrap this in the
    SSE-friendly try/except that logs but does not break the
    already-flushed stream.
    """
    req_payload = payload.get("requirement") or {}
    bom_payload = payload.get("bom_items") or []
    mermaid = payload.get("mermaid_code")
    st_payload = payload.get("st_modules") or []

    if isinstance(req_payload, dict) and req_payload:
        existing_req_id = (
            await session.execute(
                select(Requirement.id).where(Requirement.project_id == project_id)
            )
        ).scalar_one_or_none()
        if existing_req_id is not None:
            await session.execute(
                delete(IOItem).where(IOItem.requirement_id == existing_req_id)
            )
            await session.execute(
                delete(LogicRule).where(LogicRule.requirement_id == existing_req_id)
            )
            await session.execute(
                delete(Requirement).where(Requirement.id == existing_req_id)
            )
            await session.flush()

        req = Requirement(
            project_id=project_id,
            machine_type=req_payload.get("machine_type"),
            safety_level=req_payload.get("safety_level"),
            environment=req_payload.get("environment"),
            plc_family=req_payload.get("plc_family"),
            raw_text=raw_text or req_payload.get("raw_text", ""),
        )
        session.add(req)
        await session.flush()

        for io in req_payload.get("io_list", []) or []:
            if isinstance(io, dict):
                session.add(
                    IOItem(
                        requirement_id=req.id,
                        tag=io.get("tag", ""),
                        io_type=io.get("type", "DI"),
                        description=io.get("description", ""),
                    )
                )
        for rule in req_payload.get("control_logic", []) or []:
            session.add(LogicRule(requirement_id=req.id, description=str(rule)))

    await session.execute(delete(BOMItem).where(BOMItem.project_id == project_id))
    for item_data in bom_payload:
        if not isinstance(item_data, dict):
            continue
        session.add(
            BOMItem(
                project_id=project_id,
                category=str(item_data.get("category", "")),
                manufacturer=str(item_data.get("manufacturer", "Unknown")),
                model=str(item_data.get("model", "")),
                quantity=int(item_data.get("quantity", 1)),
                specifications=(
                    item_data.get("specifications", {})
                    if isinstance(item_data.get("specifications"), dict)
                    else {}
                ),
                confidence=str(item_data.get("confidence", "rag")),
                source_chunk_id=item_data.get("source_chunk_id"),
                alternatives=(
                    item_data.get("alternatives", [])
                    if isinstance(item_data.get("alternatives"), list)
                    else []
                ),
            )
        )

    await session.execute(delete(Schematic).where(Schematic.project_id == project_id))
    if mermaid and isinstance(mermaid, str):
        session.add(Schematic(project_id=project_id, mermaid_code=mermaid))

    await session.execute(delete(STModule).where(STModule.project_id == project_id))
    for i, mod in enumerate(st_payload):
        if not isinstance(mod, dict):
            mod = {"name": f"Module_{i}", "module_type": "FC", "code": str(mod)}
        session.add(
            STModule(
                project_id=project_id,
                name=str(mod.get("name", f"Module_{i}")),
                module_type=str(mod.get("module_type", "FC")),
                code=str(mod.get("code", "")),
                sort_order=i,
            )
        )

    await session.execute(
        update(Project).where(Project.id == project_id).values(status="ready")
    )
    await session.commit()


# SSE 通用响应头: 关闭 nginx 与浏览器缓冲, 保持长连接 chunk 实时下发
_SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}

# 心跳间隔 — 每 15s 注释行 (SSE 标准: 以 ":" 开头的行被客户端忽略)
# 防止 cntlm/nginx/浏览器在长时间无数据时断开 SSE 连接
_SSE_HEARTBEAT_SECONDS = 15.0


async def _sse_with_heartbeat(source):
    """Wrap an async generator yielding SSE strings with periodic heartbeats.

    Keeps the connection alive across long LLM calls (which can run > 60s with
    no intermediate yields), preventing intermediate proxies / browser fetch
    layers from declaring the stream dead.
    """
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def producer():
        try:
            async for msg in source:
                await queue.put(msg)
        finally:
            await queue.put(None)

    task = asyncio.create_task(producer())
    try:
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=_SSE_HEARTBEAT_SECONDS)
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
                continue
            if msg is None:
                return
            yield msg
    finally:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass


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
            print(f"[analyze-v2] stream error for project {project_id}: {e!r}", flush=True)
            traceback.print_exc()
            yield f"data: {json_module.dumps({'error': str(e) or type(e).__name__})}\n\n"
            return

        # DB save runs AFTER SSE stream ends — must not crash the connection
        if final_state:
            try:
                from app.db.repository import async_session
                async with async_session() as db:
                    await save_to_db(db, project_id, final_state, raw_text=body.text)
            except Exception as e:
                # DB save failed but SSE already completed — log only, don't break connection
                print(f"DB save error (non-fatal, SSE already sent): {e!r}", flush=True)
                traceback.print_exc()

    return StreamingResponse(
        _sse_with_heartbeat(event_generator()),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/{project_id}/chat")
async def chat_with_project(project_id: str, body: ChatInput, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    async def event_generator():
        try:
            async for event in chat_orchestrator.stream_chat(
                project_id=project_id,
                user_input=body.text,
                history=body.history,
                canvas_context=body.canvas_context,
                llm_config=body.llm_config,
            ):
                yield f"data: {json_module.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as e:
            print(f"[chat] stream error for project {project_id}: {e!r}", flush=True)
            traceback.print_exc()
            yield f"data: {json_module.dumps({'error': str(e) or type(e).__name__}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        _sse_with_heartbeat(event_generator()),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


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
            print(f"[resume] stream error for project {project_id}: {e!r}", flush=True)
            traceback.print_exc()
            yield f"data: {json_module.dumps({'error': str(e) or type(e).__name__})}\n\n"
            return

        if final_state:
            try:
                from app.db.repository import async_session
                async with async_session() as db:
                    await save_to_db(
                        db,
                        project_id,
                        final_state,
                        raw_text="[Resumed with human selection]",
                    )
            except Exception as e:
                print(f"DB save error in resume (non-fatal, SSE already sent): {e!r}", flush=True)
                traceback.print_exc()

    return StreamingResponse(
        _sse_with_heartbeat(event_generator()),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
