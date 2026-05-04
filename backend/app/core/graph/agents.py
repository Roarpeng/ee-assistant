"""LangGraph agent node functions — each node receives state, returns partial state update."""
from app.core.graph.state import AnalysisState
from app.core.llm_service import llm_service
from app.core.rule_engine import validate_all


async def requirements_agent(state: AnalysisState) -> dict:
    req = await llm_service.analyze_requirements(state["user_input"])
    return {
        "requirement": req,
        "safety_level": req.get("safety_level"),
        "stage": "requirements_done",
    }


async def category_mapper(state: AnalysisState) -> dict:
    req = state.get("requirement", {})
    io_list = req.get("io_list", [])
    logic_list = req.get("control_logic", [])
    categories = await llm_service.map_categories(io_list, logic_list)
    return {"categories": categories}


async def safety_assessor(state: AnalysisState) -> dict:
    req = state.get("requirement", {})
    sil = req.get("safety_level", "SIL1")
    return {"safety_level": sil}


async def constraint_extractor(state: AnalysisState) -> dict:
    req = state.get("requirement", {})
    constraints = {
        "plc_family": req.get("plc_family", "S7-1200"),
        "budget": req.get("budget"),
        "cabinet_size": req.get("cabinet_size"),
    }
    return {"constraints": constraints}


async def fanout_selection_supervisor(state: AnalysisState) -> dict:
    """Fan-out: for each category, search RAG + graph neighbors. One async session per category."""
    from app.core.rag_engine import rag_engine
    from app.db.repository import async_session

    categories = state.get("categories", [])
    all_bom = []
    new_traces = []

    async with async_session() as session:
        for cat in categories:
            try:
                results = await rag_engine.search_with_graph(
                    f"select {cat} for industrial automation",
                    component_type=cat,
                    top_k=3,
                    session=session,
                )
            except Exception:
                results = []
            if results:
                best = results[0]
                item = {
                    "category": cat,
                    "manufacturer": best["metadata"].get("manufacturer", "Unknown"),
                    "model": best.get("content", "")[:80],
                    "quantity": 1,
                    "specifications": best.get("metadata", {}),
                    "confidence": "rag" if best.get("source") == "qdrant" else "graph",
                    "source_chunk_id": best.get("id") if best.get("source") == "qdrant" else None,
                    "alternatives": [
                        {"manufacturer": c["metadata"].get("manufacturer", ""), "model": c.get("content", "")[:60]}
                        for c in results[1:3]
                    ],
                }
                all_bom.append(item)
                if best.get("source") == "graph":
                    new_traces.append({
                        "category": cat,
                        "node_id": best.get("id"),
                        "component": best.get("content", "")[:60],
                    })

    return {
        "bom_items": all_bom,
        "graph_traces": new_traces,
        "stage": "selection_done",
    }


async def rule_validator(state: AnalysisState) -> dict:
    bom = state.get("bom_items", [])
    req = state.get("requirement", {})
    req_data = {
        "safety_level": req.get("safety_level", ""),
        "total_load_current_a": 0,
    }
    violations = validate_all(bom, req_data)
    return {"violations": violations}


async def schematic_generator(state: AnalysisState) -> dict:
    bom = state.get("bom_items", [])
    req = state.get("requirement", {})
    bom_list = [{"category": i["category"], "manufacturer": i["manufacturer"], "model": i["model"]} for i in bom]
    req_data = {
        "machine_type": req.get("machine_type"),
        "safety_level": req.get("safety_level"),
    }
    mermaid = await llm_service.generate_schematic_mermaid(bom_list, req_data)
    return {"mermaid_code": mermaid}


async def code_generator(state: AnalysisState) -> dict:
    bom = state.get("bom_items", [])
    req = state.get("requirement", {})
    req_data = {
        "machine_type": req.get("machine_type"),
        "safety_level": req.get("safety_level"),
        "plc_family": req.get("plc_family"),
        "io_list": req.get("io_list", []),
        "control_logic": req.get("control_logic", []),
    }
    bom_list = [{"category": i["category"], "manufacturer": i["manufacturer"], "model": i["model"]} for i in bom]
    modules = await llm_service.generate_st_code(req_data, bom_list)
    return {"st_modules": modules}


async def final_review_agent(state: AnalysisState) -> dict:
    bom = state.get("bom_items", [])
    violations = state.get("violations", [])
    notes = []
    categories_found = {item["category"] for item in bom}
    required_categories = {"PLC_CPU", "Power_Supply", "Circuit_Breaker"}
    missing = required_categories - categories_found
    if missing:
        notes.append(f"Missing essential categories: {missing}")
    if violations:
        errors = [v for v in violations if v.get("severity") == "error"]
        if errors:
            notes.append(f"{len(errors)} hard constraint violations. Review required before proceeding.")
    return {"review_notes": notes}
