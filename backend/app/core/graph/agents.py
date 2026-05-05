"""LangGraph agent node functions — each node receives state, returns partial state update."""
from langgraph.types import interrupt
from app.core.graph.state import AnalysisState
from app.core.llm_service import llm_service
from app.core.rule_engine import validate_all


async def requirements_agent(state: AnalysisState) -> dict:
    # Skip if already completed (continuing conversation)
    if state.get("stage", "") in ("requirements_done", "selection_done", "continuing") and state.get("requirement"):
        return {}
    req = await llm_service.analyze_requirements(state["user_input"])
    return {
        "requirement": req,
        "safety_level": req.get("safety_level"),
        "stage": "requirements_done",
    }


async def category_mapper(state: AnalysisState) -> dict:
    # Skip if categories already exist
    existing_cats = state.get("categories")
    if existing_cats:
        return {}
    req = state.get("requirement", {})
    io_list = req.get("io_list", [])
    logic_list = req.get("control_logic", [])
    categories = await llm_service.map_categories(io_list, logic_list)

    # Fallback: if LLM returns empty, derive categories from IO types
    if not categories:
        categories = _derive_categories_from_requirement(req)
    return {"categories": categories}


def _derive_categories_from_requirement(req: dict) -> list[str]:
    """Rule-based category derivation when LLM returns empty results."""
    cats: set[str] = set()
    io_list: list[dict] = req.get("io_list", [])
    logic_list: list[str] = req.get("control_logic", [])
    machine_type = str(req.get("machine_type", "")).lower()
    plc_family = str(req.get("plc_family", "")).upper()

    io_types = {io.get("type", "") for io in io_list}

    if io_types & {"DI", "DO", "AI", "AO"}:
        cats.add("PLC_CPU")
        cats.add("Power_Supply")
        cats.add("Circuit_Breaker")
        if io_types & {"DI", "DO"}:
            cats.add("IO_Module")

    if io_types & {"AI", "AO"}:
        cats.add("IO_Module")

    combined_text = " ".join(logic_list + [machine_type, plc_family]).lower()
    for keyword, category in [
        # Safety
        ("safety", "Safety_Relay"),
        ("e-stop", "Safety_Relay"),
        ("emergency", "Safety_Relay"),
        ("estop", "Safety_Relay"),
        # Motion — servo
        ("servo", "Servo_Drive"),
        ("滑台", "Servo_Drive"),
        ("丝杆", "Servo_Drive"),
        ("线性", "Servo_Drive"),
        ("模组", "Servo_Drive"),
        ("定位", "Servo_Drive"),
        ("精密", "Servo_Drive"),
        # Motion — VFD / motor
        ("vfd", "VFD"),
        ("变频", "VFD"),
        ("电机", "Contactor"),
        ("马达", "Contactor"),
        ("motor", "Contactor"),
        ("induction", "VFD"),
        # HMI
        ("hmi", "HMI"),
        ("触摸", "HMI"),
        ("屏", "HMI"),
        ("touch", "HMI"),
        ("display", "HMI"),
        ("人机", "HMI"),
        # Sensors
        ("sensor", "Sensor"),
        ("传感器", "Sensor"),
        ("限位", "Sensor"),
        ("光电", "Sensor"),
        ("接近", "Sensor"),
        ("位置", "Sensor"),
        ("编码器", "Sensor"),
        ("encoder", "Sensor"),
        ("home", "Sensor"),
        # Communication
        ("profinet", "Communication_Module"),
        ("ethernet", "Communication_Module"),
        ("ethercat", "Communication_Module"),
        ("modbus", "Communication_Module"),
        ("通讯", "Communication_Module"),
        # Power & protection
        ("breaker", "Circuit_Breaker"),
        ("断路器", "Circuit_Breaker"),
        ("power", "Power_Supply"),
        ("电源", "Power_Supply"),
        ("开关电源", "Power_Supply"),
        ("24v", "Power_Supply"),
        ("transformer", "Transformer"),
        ("变压器", "Transformer"),
        ("fuse", "Fuse"),
        ("保险", "Fuse"),
        # Switches & relays
        ("switch", "Switch"),
        ("contactor", "Contactor"),
        ("接触器", "Contactor"),
        ("继电器", "Relay"),
        ("relay", "Relay"),
        # IPC
        ("ipc", "IPC"),
        ("工控机", "IPC"),
    ]:
        if keyword in combined_text:
            cats.add(category)

    # Ensure minimum viable BOM — always needed for any automation system
    cats.add("PLC_CPU")
    cats.add("Power_Supply")
    cats.add("Circuit_Breaker")

    return sorted(cats)


async def safety_assessor(state: AnalysisState) -> dict:
    if state.get("safety_level"):
        return {}
    req = state.get("requirement", {})
    sil = req.get("safety_level", "SIL1")
    return {"safety_level": sil}


async def constraint_extractor(state: AnalysisState) -> dict:
    if state.get("constraints"):
        return {}
    req = state.get("requirement", {})
    constraints = {
        "plc_family": req.get("plc_family", "S7-1200"),
        "budget": req.get("budget"),
        "cabinet_size": req.get("cabinet_size"),
    }
    return {"constraints": constraints}


async def fanout_selection_supervisor(state: AnalysisState) -> dict:
    """Fan-out selection with zero-hallucination guarantee.

    For each category:
      - Graph path (authoritative): exact part number + accessory verification.
      - If NOT_FOUND → NO LLM fallback → interrupt workflow for human input.

    The node can be called in two modes:
      1. Initial run: processes categories from state, may interrupt.
      2. Resume run: receives manual selections via interrupt() return value.
    """
    from app.core.rag_engine import rag_engine
    from app.core.llm_service import llm_service
    from app.db.repository import async_session

    # Skip if BOM already populated (continuing conversation)
    existing_bom = state.get("bom_items")
    if existing_bom and len(existing_bom) > 0:
        return {}

    categories = state.get("categories", [])
    all_bom: list[dict] = []
    new_traces: list[dict] = []
    not_found_categories: list[str] = []
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

            if not results:
                llm_fallback_categories.append(cat)
                continue

            # Check for NOT_FOUND sentinel from GraphRetriever
            best = results[0]
            is_not_found = (
                best.get("metadata", {}).get("status") == "NOT_FOUND"
                or best.get("content", "").startswith("STATUS: NOT_FOUND")
            )
            if is_not_found:
                not_found_categories.append(cat)
                continue

            # Valid match — build BOM item
            is_graph = best.get("source") == "graph" and best.get("authoritative", False)
            item = {
                "category": cat,
                "manufacturer": best["metadata"].get("manufacturer", "Unknown"),
                "model": best["metadata"].get("order_number", "") or best.get("content", "")[:80],
                "order_number": best["metadata"].get("order_number", ""),
                "quantity": 1,
                "specifications": best.get("metadata", {}),
                "confidence": "graph" if is_graph else "rag",
                "source_chunk_id": best.get("id") if best.get("source") == "qdrant" else None,
                "alternatives": [
                    {
                        "manufacturer": c["metadata"].get("manufacturer", ""),
                        "model": c["metadata"].get("order_number", "") or c.get("content", "")[:60],
                    }
                    for c in results[1:3]
                ],
            }
            all_bom.append(item)
            if is_graph:
                new_traces.append({
                    "category": cat,
                    "node_id": best.get("id"),
                    "component": best.get("content", "")[:60],
                })

    # ── Zero-hallucination gate: NOT_FOUND → interrupt workflow ──
    if not_found_categories:
        human_input = interrupt({
            "action": "human_selection_required",
            "not_found_categories": not_found_categories,
            "message": (
                f"缺少匹配元器件: {', '.join(not_found_categories)}。"
                f"请人工输入确切的制造商和订货号。"
            ),
            "current_bom": all_bom,
            "llm_fallback_attempted": len(llm_fallback_categories) > 0,
        })

        # On resume: human_input contains { "manual_selections": [...] }
        if isinstance(human_input, dict) and human_input.get("manual_selections"):
            for manual in human_input["manual_selections"]:
                all_bom.append({
                    "category": manual.get("category", ""),
                    "manufacturer": manual.get("manufacturer", "Human Selected"),
                    "model": manual.get("order_number", "") or manual.get("model", ""),
                    "order_number": manual.get("order_number", ""),
                    "quantity": manual.get("quantity", 1),
                    "specifications": manual.get("specifications", {}),
                    "confidence": "human",
                    "source_chunk_id": None,
                    "alternatives": [],
                })

    # LLM fallback for categories with no RAG results at all (neither graph nor vector).
    # These are clearly marked as non-authoritative — the zero-hallucination rule
    # applies to graph misses (NOT_FOUND), not to empty knowledge bases.
    if llm_fallback_categories:
        try:
            llm_bom = await llm_service.recommend_components(
                categories=llm_fallback_categories,
                machine_type=state.get("requirement", {}).get("machine_type", ""),
            )
            for item in llm_bom:
                item["confidence"] = "llm"
                item["source_chunk_id"] = None
                item["order_number"] = ""
                item.setdefault("alternatives", [])
                item["specifications"] = item.get("specifications", {})
                item["specifications"]["_warning"] = (
                    "LLM recommendation — verify against manufacturer catalog before procurement"
                )
                all_bom.append(item)
        except Exception:
            for cat in llm_fallback_categories:
                all_bom.append({
                    "category": cat,
                    "manufacturer": "TBD",
                    "model": f"{cat} component — REQUIRES HUMAN VERIFICATION",
                    "order_number": "",
                    "quantity": 1,
                    "specifications": {"_warning": "No knowledge base match — human verification required"},
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
    # Skip if topology already generated
    topo = state.get("topology")
    if topo and topo.get("nodes") and len(topo["nodes"]) > 0:
        return {}
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
    # Skip if ST code already generated
    existing = state.get("st_modules")
    if existing and len(existing) > 0:
        return {}
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
