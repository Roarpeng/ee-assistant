import logging

log = logging.getLogger(__name__)
import time

from fastapi import WebSocket
from langgraph.types import Command
from app.core.llm_service import llm_service
from app.core.run_history_service import finish_run, start_run
from app.core.schemas import ProgressEvent
from app.db.models import Requirement, IOItem, LogicRule


# LangGraph node → user-facing message mapping
_NODE_MESSAGES: dict[str, str] = {
    "requirements_agent": "需求分析完成。",
    "category_mapper": "组件类别映射完成。",
    "safety_assessor": "安全性评估完成。",
    "constraint_extractor": "设计约束提取完成。",
    "selection_supervisor": "组件选型（RAG检索）完成。",
    "rule_validator": "设计规则验证完成。",
    "schematic_generator": "系统拓扑结构生成完成。",
    "code_generator": "PLC ST 代码生成完成。",
    "final_review_agent": "最终审查完成。",
    "commissioning_generator": "调试步骤生成完成。",
    "wiring_generator": "I/O 接线表生成完成。",
}


def _node_message(node_name: str) -> str:
    return _NODE_MESSAGES.get(node_name, f"节点 '{node_name}' 执行完成。")


class Orchestrator:
    def __init__(self):
        self._ws: dict[str, WebSocket] = {}

    def register_ws(self, project_id: str, ws: WebSocket):
        self._ws[project_id] = ws

    def unregister_ws(self, project_id: str):
        self._ws.pop(project_id, None)

    async def push(self, project_id: str, event: ProgressEvent):
        ws = self._ws.get(project_id)
        if ws:
            try:
                await ws.send_text(event.model_dump_json())
            except Exception:
                log.debug("WS send failed, unregistering %s", project_id)
                self.unregister_ws(project_id)

    async def run_analysis(self, project_id: str, user_input: str, session) -> dict:
        await self.push(project_id, ProgressEvent(stage="analyzing", message="Analyzing requirements..."))
        req_data = await llm_service.analyze_requirements(user_input)

        req = Requirement(
            project_id=project_id,
            machine_type=req_data.get("machine_type"),
            safety_level=req_data.get("safety_level"),
            environment=req_data.get("environment"),
            plc_family=req_data.get("plc_family"),
            raw_text=user_input,
        )
        session.add(req)
        await session.flush()

        for io in req_data.get("io_list", []):
            session.add(IOItem(requirement_id=req.id, tag=io["tag"], io_type=io["type"], description=io["description"]))
        for rule in req_data.get("control_logic", []):
            session.add(LogicRule(requirement_id=req.id, description=rule))
        await session.commit()

        await self.push(project_id, ProgressEvent(stage="ready", message="Requirements analysis complete.", data=req_data))
        return req_data

    async def _configure_services(self, llm_config: dict | None, embedding_config: dict | None):
        """Apply runtime LLM / embedding overrides."""
        from app.core.rag_engine import rag_engine
        if llm_config or embedding_config:
            llm_service.configure(chat_config=llm_config, embed_config=embedding_config)
        if embedding_config:
            rag_engine.configure(
                api_key=embedding_config.get("api_key", ""),
                base_url=embedding_config.get("base_url", ""),
                model=embedding_config.get("model", ""),
                dimensions=embedding_config.get("dimension", 0),
            )

    async def _lookup_project_org_id(self, project_id: str) -> str | None:
        """Resolve the project's org_id (None if project missing or has no org).

        Centralised so every entry point that builds an initial AnalysisState
        injects the same value — RequirementsAgent reads `state["org_id"]`
        to enrich the parsed requirement from this org's preferences.
        """
        from sqlalchemy import select
        from app.db.models import Project
        from app.db.repository import async_session
        try:
            async with async_session() as session:
                proj = (await session.execute(
                    select(Project).where(Project.id == project_id)
                )).scalar_one_or_none()
                if proj is None:
                    return None
                return getattr(proj, "org_id", None)
        except Exception:
            return None

    async def _build_input_state(
        self, project_id: str, user_input: str,
        llm_config: dict | None, embedding_config: dict | None,
        history: list[dict] | None, graph,
    ) -> dict:
        """Build input state: full initial for new projects, incremental for continuing.

        For a fresh run we also open a `run_history` row (M2 Track B) and
        thread its id through state so every downstream node and the
        terminal `finish_run` call share the same telemetry handle. We
        deliberately skip the run-open on the continuing path: those
        invocations either resume an interrupted run (whose id is already
        in the checkpoint) or replay an old project, and we don't want
        orphan rows for either.
        """
        config = {"configurable": {"thread_id": project_id}}
        current_state = await graph.aget_state(config)

        org_id = await self._lookup_project_org_id(project_id)

        if not current_state.values:
            # `start_run` is best-effort — if it fails it returns None and
            # `finish_run` will silently no-op at the end of the stream.
            run_history_id = await start_run(project_id)
            return {
                "project_id": project_id,
                "user_input": user_input,
                "requirement": None,
                "categories": None,
                "safety_level": None,
                "constraints": None,
                "bom_items": None,
                "violations": None,
                "mermaid_code": None,
                "st_modules": None,
                "topology": None,
                "review_notes": None,
                "project_meta": None,
                "io_budget": None,
                "commissioning_steps": None,
                "io_items": None,
                "clarification": None,
                "graph_traces": [],
                "errors": [],
                "messages": [],
                "llm_fallback_categories": None,
                "stage": "started",
                "llm_config": llm_config,
                "embedding_config": embedding_config,
                "org_id": org_id,
                "run_history_id": run_history_id,
            }
        else:
            state: dict = {
                "user_input": user_input,
                "stage": "continuing",
                "llm_config": llm_config,
                "embedding_config": embedding_config,
                "org_id": org_id,
            }
            if history:
                state["messages"] = history
            return state

    # 把节点产出的字段映射到前端可直接 applyAnalysisPayload() 消费的 payload。
    # 让用户在工作流跑到一半就能看到 BOM、画布、代码 ── 渐进式呈现, 不再等终点。
    _NODE_PARTIAL_KEYS: dict[str, tuple[str, ...]] = {
        "requirements_agent":   ("requirement", "clarification"),
        "category_mapper":      ("categories",),
        "selection_supervisor": ("bom_items",),
        "rule_validator":       ("violations", "io_budget"),
        "schematic_generator":  ("mermaid_code", "topology"),
        "code_generator":       ("st_modules",),
        "final_review_agent":   ("review_notes", "project_meta"),
        "commissioning_generator": ("commissioning_steps",),
        "wiring_generator":     ("io_items",),
    }

    @classmethod
    def _build_partial_payload(cls, node_name: str, state_update: dict | None) -> dict | None:
        """Extract the just-produced fields for a node into a frontend-shaped payload.

        Returns None if there's nothing meaningful to push (e.g. node skipped).
        """
        if not isinstance(state_update, dict):
            return None
        keys = cls._NODE_PARTIAL_KEYS.get(node_name)
        if not keys:
            return None
        partial: dict = {}
        for key in keys:
            if key in state_update and state_update[key] is not None:
                partial[key] = state_update[key]
        return partial or None

    async def _stream_events(
        self,
        graph,
        input_state_or_command,
        config: dict,
        *,
        run_id: str | None = None,
    ):
        """Core event loop: yield step/partial/interrupt/done events from graph.astream.

        Handles four event types:
          - Normal node completion → {"step": ..., "node": ..., "partial": {...}}
            `partial` carries the node's just-produced fields (BOM, topology, etc.)
            so the frontend can render them progressively without waiting for `done`.
          - Interrupt (NOT_FOUND)   → {"event": "interrupt", "data": ...}
          - Graph done              → {"done": True, "payload": ...}

        On `done` or exception we also close out the M2 Track B
        `run_history` row identified by ``run_id`` (best-effort — a
        telemetry failure must never break a running graph). We
        deliberately do NOT close the row on the interrupt path: the
        run is still alive and will be finished by the resume call's
        own `_stream_events` invocation.
        """
        nodes_executed: dict[str, float] = {}
        errors: list[dict] = []
        final_stage: str | None = None
        last_tick = time.monotonic()
        try:
            async for event in graph.astream(input_state_or_command, config):
                now = time.monotonic()
                elapsed_ms = (now - last_tick) * 1000.0
                last_tick = now

                # ── Interrupt gate: human intervention required ──
                if "__interrupt__" in event:
                    interrupt_tuple = event["__interrupt__"]
                    interrupt_obj = interrupt_tuple[0] if interrupt_tuple else None
                    interrupt_value = getattr(interrupt_obj, "value", interrupt_obj)
                    yield {
                        "event": "interrupt",
                        "data": interrupt_value,
                        "message": (
                            "缺少匹配元器件，请人工选择。"
                            if isinstance(interrupt_value, dict)
                            else str(interrupt_value)
                        ),
                    }
                    return  # Run is paused, not finished — keep run_history row open.

                for node_name, state_update in event.items():
                    nodes_executed[node_name] = (
                        nodes_executed.get(node_name, 0.0) + elapsed_ms
                    )
                    if isinstance(state_update, dict):
                        stage = state_update.get("stage")
                        if stage:
                            final_stage = stage
                    evt: dict = {"step": _node_message(node_name), "node": node_name}
                    partial = self._build_partial_payload(node_name, state_update)
                    if partial:
                        evt["partial"] = partial
                    yield evt
        except Exception as exc:
            errors.append({"error": repr(exc)})
            await finish_run(
                run_id,
                nodes_executed=nodes_executed,
                errors=errors,
                final_stage=final_stage,
            )
            raise

        # Stream complete — read full final state from checkpoint
        final_state = (await graph.aget_state(config)).values
        if not final_stage and isinstance(final_state, dict):
            final_stage = final_state.get("stage")
        await finish_run(
            run_id,
            nodes_executed=nodes_executed,
            errors=errors,
            final_stage=final_stage,
        )

        # M3 Track A: capture this finished run as an EpisodicMemory row
        # so cross-project selection can retrieve it later. We read
        # project_id + org_id straight off the final state (both were
        # injected by `_build_input_state`); if the state shape is
        # unexpected we silently skip rather than guess. The extractor
        # itself is internally try/except-wrapped, but we add a second
        # layer here so a NameError / import failure can never break
        # the done event downstream consumers depend on.
        try:
            if isinstance(final_state, dict):
                pid = final_state.get("project_id")
                org_id = final_state.get("org_id")
                if pid:
                    from app.core.episode_extractor import extract_and_store_episode
                    await extract_and_store_episode(pid, org_id, final_state)
        except Exception:
            log.debug("best-effort operation failed", exc_info=True)

        yield {"done": True, "payload": final_state}

    async def stream_graph_analysis(self, project_id: str, user_input: str,
                                     llm_config: dict | None = None,
                                     embedding_config: dict | None = None,
                                     history: list[dict] | None = None):
        """Start (or continue) a LangGraph analysis, streaming SSE events."""
        from app.core.graph.builder import build_graph

        yield {"step": "正在准备 LangGraph 执行环境...", "node": "init"}
        await self._configure_services(llm_config, embedding_config)

        graph = await build_graph()
        config = {"configurable": {"thread_id": project_id}}
        input_state = await self._build_input_state(
            project_id, user_input, llm_config, embedding_config, history, graph
        )

        run_id = input_state.get("run_history_id") if isinstance(input_state, dict) else None
        if run_id is None:
            # `_build_input_state` skipped start_run because we're continuing
            # an in-flight run — recover the existing id from the checkpoint
            # so finish_run still has the right row to close out.
            try:
                current_state = await graph.aget_state(config)
                run_id = (current_state.values or {}).get("run_history_id")
            except Exception:
                run_id = None

        async for evt in self._stream_events(graph, input_state, config, run_id=run_id):
            yield evt

    async def resume_graph_analysis(self, project_id: str, resume_value: dict):
        """Resume a paused LangGraph analysis after human provides manual selection.

        resume_value shape:
          {"manual_selections": [{"category": "IO_Module", "order_number": "6ES7...", ...}]}

        Before re-entering the graph we capture each manual selection as a
        ``Decision(type='manual_select')`` and bump the matching
        ``selection_weights`` row so the next analysis ranks this
        manufacturer/model first (M2 Track B). Decision capture is
        best-effort — a telemetry failure must never block resume.
        """
        from app.core.graph.builder import build_graph

        yield {"step": "人工选型数据已接收，继续工程分析...", "node": "resume"}
        await self._configure_services(None, None)

        graph = await build_graph()
        config = {"configurable": {"thread_id": project_id}}

        # ── Pull org_id / run_id / interrupt payload from the live checkpoint ──
        org_id: str | None = None
        run_id: str | None = None
        interrupt_value: dict | None = None
        try:
            snapshot = await graph.aget_state(config)
            state_values = snapshot.values or {}
            org_id = state_values.get("org_id")
            run_id = state_values.get("run_history_id")
            for task in (getattr(snapshot, "tasks", ()) or ()):
                for itr in (getattr(task, "interrupts", None) or ()):
                    val = getattr(itr, "value", None)
                    if val is not None:
                        interrupt_value = val if isinstance(val, dict) else {"value": val}
                        break
                if interrupt_value is not None:
                    break
        except Exception:
            log.debug("best-effort operation failed", exc_info=True)

        await self._capture_manual_selections(
            project_id=project_id,
            org_id=org_id,
            resume_value=resume_value or {},
            interrupt_value=interrupt_value,
        )

        async for evt in self._stream_events(graph, Command(resume=resume_value), config, run_id=run_id):
            yield evt

    async def _capture_manual_selections(
        self,
        *,
        project_id: str,
        org_id: str | None,
        resume_value: dict,
        interrupt_value: dict | None,
    ) -> None:
        """Persist each manual_select as a Decision row + bump weights.

        All writes are wrapped — if Track A's tables haven't migrated yet or
        the DB hiccups, we swallow the error so resume never fails on
        telemetry. Kept out-of-band from `_stream_events` so the hot path
        stays clean.
        """
        manual_selections = resume_value.get("manual_selections") or []
        if not manual_selections:
            return
        try:
            from app.core.decisions_service import bump_weight, record_decision
            from app.db.repository import async_session
        except Exception:
            return

        try:
            async with async_session() as session:
                for sel in manual_selections:
                    if not isinstance(sel, dict):
                        continue
                    category = sel.get("category") or ""
                    manufacturer = sel.get("manufacturer") or ""
                    model = sel.get("order_number") or sel.get("model") or ""
                    try:
                        await record_decision(
                            session,
                            project_id=project_id,
                            org_id=org_id,
                            type="manual_select",
                            context={"source": "resume_graph_analysis"},
                            before=interrupt_value,
                            after=sel,
                        )
                    except Exception:
                        pass
                    if category and manufacturer and model:
                        try:
                            await bump_weight(
                                session,
                                org_id=org_id,
                                category=category,
                                manufacturer=manufacturer,
                                model=model,
                            )
                        except Exception:
                            pass
        except Exception:
            log.debug("best-effort operation failed", exc_info=True)

    async def run_graph_analysis(self, project_id: str, user_input: str,
                                  llm_config: dict | None = None,
                                  embedding_config: dict | None = None) -> dict:
        from app.core.graph.builder import build_graph

        await self._configure_services(llm_config, embedding_config)

        graph = await build_graph()
        config = {"configurable": {"thread_id": project_id}}
        input_state = await self._build_input_state(
            project_id, user_input, llm_config, embedding_config, None, graph
        )
        run_id = input_state.get("run_history_id") if isinstance(input_state, dict) else None

        nodes_executed: dict[str, float] = {}
        errors: list[dict] = []
        try:
            final_state = await graph.ainvoke(input_state, config)
        except Exception as exc:
            errors.append({"error": repr(exc)})
            await finish_run(run_id, nodes_executed=nodes_executed, errors=errors)
            raise

        final_stage = None
        if isinstance(final_state, dict):
            final_stage = final_state.get("stage")
        await finish_run(
            run_id,
            nodes_executed=nodes_executed,
            errors=errors,
            final_stage=final_stage,
        )
        return final_state


orchestrator = Orchestrator()
