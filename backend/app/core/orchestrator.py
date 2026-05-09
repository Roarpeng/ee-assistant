from fastapi import WebSocket
from langgraph.types import Command
from app.core.llm_service import llm_service
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

    def _build_input_state(
        self, project_id: str, user_input: str,
        llm_config: dict | None, embedding_config: dict | None,
        history: list[dict] | None, graph,
    ) -> dict:
        """Build input state: full initial for new projects, incremental for continuing."""
        config = {"configurable": {"thread_id": project_id}}
        current_state = graph.get_state(config)

        if not current_state.values:
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
                "graph_traces": [],
                "errors": [],
                "messages": [],
                "llm_fallback_categories": None,
                "stage": "started",
                "llm_config": llm_config,
                "embedding_config": embedding_config,
            }
        else:
            state: dict = {
                "user_input": user_input,
                "stage": "continuing",
                "llm_config": llm_config,
                "embedding_config": embedding_config,
            }
            if history:
                state["messages"] = history
            return state

    # 把节点产出的字段映射到前端可直接 applyAnalysisPayload() 消费的 payload。
    # 让用户在工作流跑到一半就能看到 BOM、画布、代码 ── 渐进式呈现, 不再等终点。
    _NODE_PARTIAL_KEYS: dict[str, tuple[str, ...]] = {
        "requirements_agent":   ("requirement",),
        "category_mapper":      ("categories",),
        "selection_supervisor": ("bom_items",),
        "rule_validator":       ("violations",),
        "schematic_generator":  ("mermaid_code", "topology"),
        "code_generator":       ("st_modules",),
        "final_review_agent":   ("review_notes",),
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

    async def _stream_events(self, graph, input_state_or_command, config: dict):
        """Core event loop: yield step/partial/interrupt/done events from graph.astream.

        Handles four event types:
          - Normal node completion → {"step": ..., "node": ..., "partial": {...}}
            `partial` carries the node's just-produced fields (BOM, topology, etc.)
            so the frontend can render them progressively without waiting for `done`.
          - Interrupt (NOT_FOUND)   → {"event": "interrupt", "data": ...}
          - Graph done              → {"done": True, "payload": ...}
        """
        async for event in graph.astream(input_state_or_command, config):
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
                return  # Stop streaming — wait for resume

            for node_name, state_update in event.items():
                evt: dict = {"step": _node_message(node_name), "node": node_name}
                partial = self._build_partial_payload(node_name, state_update)
                if partial:
                    evt["partial"] = partial
                yield evt

        # Stream complete — read full final state from checkpoint
        final_state = graph.get_state(config).values
        yield {"done": True, "payload": final_state}

    async def stream_graph_analysis(self, project_id: str, user_input: str,
                                     llm_config: dict | None = None,
                                     embedding_config: dict | None = None,
                                     history: list[dict] | None = None):
        """Start (or continue) a LangGraph analysis, streaming SSE events."""
        from app.core.graph.builder import build_graph

        yield {"step": "正在准备 LangGraph 执行环境...", "node": "init"}
        await self._configure_services(llm_config, embedding_config)

        graph = build_graph()
        config = {"configurable": {"thread_id": project_id}}
        input_state = self._build_input_state(
            project_id, user_input, llm_config, embedding_config, history, graph
        )

        async for evt in self._stream_events(graph, input_state, config):
            yield evt

    async def resume_graph_analysis(self, project_id: str, resume_value: dict):
        """Resume a paused LangGraph analysis after human provides manual selection.

        resume_value shape:
          {"manual_selections": [{"category": "IO_Module", "order_number": "6ES7...", ...}]}
        """
        from app.core.graph.builder import build_graph

        yield {"step": "人工选型数据已接收，继续工程分析...", "node": "resume"}
        await self._configure_services(None, None)

        graph = build_graph()
        config = {"configurable": {"thread_id": project_id}}

        async for evt in self._stream_events(graph, Command(resume=resume_value), config):
            yield evt

    async def run_graph_analysis(self, project_id: str, user_input: str,
                                  llm_config: dict | None = None,
                                  embedding_config: dict | None = None) -> dict:
        from app.core.graph.builder import build_graph

        await self._configure_services(llm_config, embedding_config)

        graph = build_graph()
        config = {"configurable": {"thread_id": project_id}}
        input_state = self._build_input_state(
            project_id, user_input, llm_config, embedding_config, None, graph
        )

        final_state = await graph.ainvoke(input_state, config)
        return final_state


orchestrator = Orchestrator()
