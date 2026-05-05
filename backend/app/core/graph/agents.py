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
    """Fan-out: for each category, search RAG + graph neighbors. Falls back to LLM when no match."""
    from app.core.rag_engine import rag_engine
    from app.core.llm_service import llm_service
    from app.db.repository import async_session

    categories = state.get("categories", [])
    all_bom = []
    new_traces = []
    llm_fallback_categories: list[str] = []

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
            else:
                llm_fallback_categories.append(cat)

    # LLM fallback for categories with no RAG results
    if llm_fallback_categories:
        try:
            llm_bom = await llm_service.recommend_components(
                categories=llm_fallback_categories,
                machine_type=state.get("requirement", {}).get("machine_type", ""),
            )
            for item in llm_bom:
                item["confidence"] = "llm"
                item["source_chunk_id"] = None
                item.setdefault("alternatives", [])
                all_bom.append(item)
        except Exception:
            for cat in llm_fallback_categories:
                all_bom.append({
                    "category": cat,
                    "manufacturer": "TBD",
                    "model": f"{cat} component",
                    "quantity": 1,
                    "specifications": {},
                    "confidence": "llm",
                    "source_chunk_id": None,
                    "alternatives": [],
                })

    return {
        "bom_items": all_bom,
        "graph_traces": new_traces,
        "llm_fallback_categories": llm_fallback_categories,
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


def _build_fallback_topology(bom_list: list[dict]) -> dict:
    """Generate basic topology from BOM when LLM topology generation yields empty."""
    category_to_type = {
        "PLC_CPU": "plc", "Safety_PLC": "safety_plc", "Power_Supply": "power",
        "Circuit_Breaker": "circuit_breaker", "HMI": "hmi", "IPC": "ipc",
        "IO_Module": "io", "VFD": "vfd", "Servo": "servo", "Switch": "switch",
        "Contactor": "contactor", "Relay": "relay", "Safety_Relay": "safety_relay",
        "E_Stop": "estop", "Transformer": "transformer", "Fuse": "fuse",
        "Sensor": "sensor", "Disconnect": "disconnect",
    }
    y_levels = {
        "power": 50, "circuit_breaker": 50, "disconnect": 50, "switch": 50,
        "transformer": 50, "fuse": 50,
        "plc": 250, "safety_plc": 250,
        "hmi": 450, "ipc": 450, "io": 450, "vfd": 450, "servo": 450,
        "contactor": 450, "relay": 450, "safety_relay": 450, "estop": 450, "sensor": 450,
    }
    nodes = []
    for i, item in enumerate(bom_list):
        cat = item.get("category", "")
        node_type = category_to_type.get(cat, "io")
        label = f"{item.get('manufacturer', '')} {item.get('model', cat)}".strip()
        nodes.append({
            "id": f"node_{i+1}",
            "type": node_type,
            "label": label,
            "x": 100 + (i % 4) * 250,
            "y": y_levels.get(node_type, 300),
        })
    edges = []
    plc_ids = [n["id"] for n in nodes if n["type"] in ("plc", "safety_plc")]
    power_ids = [n["id"] for n in nodes if n["type"] in ("power", "circuit_breaker", "disconnect")]
    field_ids = [n["id"] for n in nodes if n["type"] not in ("plc", "safety_plc", "power", "circuit_breaker", "disconnect")]
    for p_id in power_ids:
        for plc_id in plc_ids:
            edges.append({"id": f"e_p_{len(edges)}", "source": p_id, "target": plc_id, "protocol": "POWER_24V"})
    for plc_id in plc_ids:
        for f_id in field_ids[:8]:
            edges.append({"id": f"e_f_{len(edges)}", "source": plc_id, "target": f_id, "protocol": "PROFINET"})
    return {"nodes": nodes, "edges": edges}


async def schematic_generator(state: AnalysisState) -> dict:
    bom = state.get("bom_items", [])
    req = state.get("requirement", {})
    bom_list = [{"category": i["category"], "manufacturer": i["manufacturer"], "model": i["model"]} for i in bom]
    req_data = {
        "machine_type": req.get("machine_type"),
        "safety_level": req.get("safety_level"),
    }
    mermaid = await llm_service.generate_schematic_mermaid(bom_list, req_data)
    topology = await llm_service.generate_topology_json(bom_list, req_data)
    # When LLM fails to produce structured topology, fall back to BOM layout
    if not topology.get("nodes"):
        topology = _build_fallback_topology(bom_list)
    return {"mermaid_code": mermaid, "topology": topology}


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
    llm_fallback = state.get("llm_fallback_categories", []) or []
    notes = []
    categories_found = {item["category"] for item in bom}
    required_categories = {"PLC_CPU", "Power_Supply", "Circuit_Breaker"}
    missing = required_categories - categories_found
    if missing:
        notes.append(f"Missing essential categories: {missing}")
    if llm_fallback:
        notes.append(
            f"LLM-recommended (not from knowledge base): {llm_fallback}. "
            "Please verify specifications against manufacturer catalog before procurement."
        )
    if violations:
        errors = [v for v in violations if v.get("severity") == "error"]
        if errors:
            notes.append(f"{len(errors)} hard constraint violations. Review required before proceeding.")
    return {"review_notes": notes}
