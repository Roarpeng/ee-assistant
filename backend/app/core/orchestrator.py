from fastapi import WebSocket
from app.core.llm_service import llm_service
from app.core.schemas import ProgressEvent
from app.db.models import Requirement, IOItem, LogicRule


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

    async def stream_graph_analysis(self, project_id: str, user_input: str,
                                     llm_config: dict | None = None,
                                     embedding_config: dict | None = None):
        from app.core.graph.builder import build_graph
        from app.core.rag_engine import rag_engine

        # Immediate feedback to frontend
        yield {"step": "正在准备 LangGraph 执行环境...", "node": "init"}

        if llm_config or embedding_config:
            llm_service.configure(chat_config=llm_config, embed_config=embedding_config)
        if embedding_config:
            rag_engine.configure(
                api_key=embedding_config.get("api_key", ""),
                base_url=embedding_config.get("base_url", ""),
                model=embedding_config.get("model", ""),
                dimensions=embedding_config.get("dimension", 0),
            )

        graph = build_graph()
        config = {"configurable": {"thread_id": project_id}}
        initial_state = {
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
            "llm_fallback_categories": None,
            "stage": "started",
            "llm_config": llm_config,
            "embedding_config": embedding_config,
        }

        final_state = initial_state.copy()
        
        async for event in graph.astream(initial_state, config):
            for node_name, state_update in event.items():
                if isinstance(state_update, dict):
                    final_state.update(state_update)
                
                message = f"节点 '{node_name}' 执行完成。"
                if node_name == "requirements_agent":
                    message = "需求分析完成。"
                elif node_name == "category_mapper":
                    message = "组件类别映射完成。"
                elif node_name == "safety_assessor":
                    message = "安全性评估完成。"
                elif node_name == "selection_supervisor":
                    message = "组件选型（RAG检索）完成。"
                elif node_name == "rule_validator":
                    message = "设计规则验证完成。"
                elif node_name == "schematic_generator":
                    message = "系统拓扑结构生成完成。"
                elif node_name == "code_generator":
                    message = "PLC ST 代码生成完成。"
                
                yield {"step": message, "node": node_name}
        
        # Stream is done, yield payload from collected state
        yield {"done": True, "payload": final_state}

    async def run_graph_analysis(self, project_id: str, user_input: str,
                                  llm_config: dict | None = None,
                                  embedding_config: dict | None = None) -> dict:
        from app.core.graph.builder import build_graph
        from app.core.rag_engine import rag_engine

        # Configure LLM with frontend-provided settings (falls back to env vars)
        if llm_config or embedding_config:
            llm_service.configure(chat_config=llm_config, embed_config=embedding_config)
        if embedding_config:
            rag_engine.configure(
                api_key=embedding_config.get("api_key", ""),
                base_url=embedding_config.get("base_url", ""),
                model=embedding_config.get("model", ""),
                dimensions=embedding_config.get("dimension", 0),
            )

        graph = build_graph()
        config = {"configurable": {"thread_id": project_id}}
        initial_state = {
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
            "review_notes": None,
            "graph_traces": [],
            "errors": [],
            "stage": "started",
            "llm_config": llm_config,
            "embedding_config": embedding_config,
        }
        final_state = await graph.ainvoke(initial_state, config)
        return final_state


orchestrator = Orchestrator()
