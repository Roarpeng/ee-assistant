# LangGraph Multi-Agent + Component Knowledge Graph + Frontend Style — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor single-LLM pipeline into a LangGraph StateGraph multi-agent system, add a PostgreSQL-based component knowledge graph for electrical component relationships, and upgrade the frontend to a B/C-fusion design system (light/dark themes).

**Architecture:** 9 LangGraph agent nodes orchestrated via StateGraph with fan-out parallel selection. Component knowledge stored as typed graph (nodes + edges in PostgreSQL with JSONB properties). Frontend uses CSS custom properties for theming with Inter/JetBrains Mono fonts.

**Tech Stack:** LangGraph, NetworkX, python-louvain, FastAPI, SQLAlchemy async, React 18, Tailwind CSS 3, Zustand

---

### Task 1: Install new backend dependencies

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add dependencies to requirements.txt**

```txt
langgraph>=0.2.0
langgraph-checkpoint-sqlite>=1.0.0
networkx>=3.0
python-louvain>=0.16
```

Append to end of `backend/requirements.txt`.

- [ ] **Step 2: Install dependencies**

Run: `cd backend && pip install langgraph langgraph-checkpoint-sqlite networkx python-louvain`
Expected: All packages install without errors.

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add langgraph, networkx, python-louvain dependencies"
```

---

### Task 2: Add ComponentNode and ComponentEdge ORM models

**Files:**
- Modify: `backend/app/db/models.py`

- [ ] **Step 1: Add ComponentNode and ComponentEdge models after KnowledgeDoc**

```python
class ComponentNode(Base):
    __tablename__ = "component_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255))
    component_type: Mapped[str] = mapped_column(String(64))  # Sensor, PLC_AI, PSU, Circuit_Breaker, etc.
    properties: Mapped[dict] = mapped_column(JSON, default=dict)
    community: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_doc_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("knowledge_docs.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    source_doc: Mapped["KnowledgeDoc | None"] = relationship()
    outgoing_edges: Mapped[list["ComponentEdge"]] = relationship(
        back_populates="source_node", foreign_keys="ComponentEdge.source_id", cascade="all, delete-orphan"
    )


class ComponentEdge(Base):
    __tablename__ = "component_edges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_id: Mapped[str] = mapped_column(String(36), ForeignKey("component_nodes.id"), nullable=False)
    target_id: Mapped[str] = mapped_column(String(36), ForeignKey("component_nodes.id"), nullable=False)
    relation: Mapped[str] = mapped_column(String(32))  # REQUIRES_POWER, OUTPUTS_SIGNAL, USES_PROTOCOL, etc.
    properties: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[str] = mapped_column(String(16), default="extracted")  # extracted|inferred
    source_doc_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("knowledge_docs.id"), nullable=True)

    source_node: Mapped["ComponentNode"] = relationship(back_populates="outgoing_edges", foreign_keys=[source_id])
    target_node: Mapped["ComponentNode"] = relationship(foreign_keys=[target_id])
    source_doc: Mapped["KnowledgeDoc | None"] = relationship()
```

- [ ] **Step 2: Generate and run migration**

Run: `cd backend && PYTHONPATH=. alembic revision --autogenerate -m "add component graph tables"`
Expected: New migration file created in `backend/alembic/versions/`.

Run: `cd backend && PYTHONPATH=. alembic upgrade head`
Expected: "Running upgrade ... -> ..., add component graph tables"

- [ ] **Step 3: Commit**

```bash
git add backend/app/db/models.py backend/alembic/versions/*add_component_graph_tables*.py
git commit -m "feat: add ComponentNode and ComponentEdge ORM models with migration"
```

---

### Task 3: Implement knowledge_graph.py — ComponentGraph CRUD + BFS traversal

**Files:**
- Create: `backend/app/core/knowledge_graph.py`

- [ ] **Step 1: Write the ComponentGraph class**

```python
"""Component knowledge graph — CRUD + BFS traversal over PostgreSQL tables."""
import uuid
from collections import deque
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import ComponentNode, ComponentEdge


RELATION_TYPES = [
    "REQUIRES_POWER",
    "OUTPUTS_SIGNAL",
    "USES_PROTOCOL",
    "COMPATIBLE_WITH",
    "ALTERNATIVE_TO",
    "MOUNTS_ON",
    "CONTROLS",
]


class ComponentGraph:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert_node(self, name: str, component_type: str, properties: dict, source_doc_id: str | None = None) -> ComponentNode:
        result = await self.session.execute(
            select(ComponentNode).where(ComponentNode.name == name, ComponentNode.component_type == component_type)
        )
        node = result.scalar()
        if node:
            merged = {**node.properties, **properties}
            node.properties = merged
            if source_doc_id and not node.source_doc_id:
                node.source_doc_id = source_doc_id
        else:
            node = ComponentNode(
                id=str(uuid.uuid4()),
                name=name,
                component_type=component_type,
                properties=properties,
                source_doc_id=source_doc_id,
            )
            self.session.add(node)
        await self.session.flush()
        return node

    async def add_edge(self, source_id: str, target_id: str, relation: str, properties: dict | None = None, confidence: str = "extracted", source_doc_id: str | None = None) -> ComponentEdge:
        result = await self.session.execute(
            select(ComponentEdge).where(
                ComponentEdge.source_id == source_id,
                ComponentEdge.target_id == target_id,
                ComponentEdge.relation == relation,
            )
        )
        edge = result.scalar()
        if edge:
            edge.properties = {**(edge.properties or {}), **(properties or {})}
            if confidence == "extracted" and edge.confidence == "inferred":
                edge.confidence = "extracted"
        else:
            edge = ComponentEdge(
                id=str(uuid.uuid4()),
                source_id=source_id,
                target_id=target_id,
                relation=relation,
                properties=properties or {},
                confidence=confidence,
                source_doc_id=source_doc_id,
            )
            self.session.add(edge)
        await self.session.flush()
        return edge

    async def get_neighbors(self, node_id: str, relation: str | None = None) -> list[dict]:
        query = select(ComponentEdge).where(ComponentEdge.source_id == node_id)
        if relation:
            query = query.where(ComponentEdge.relation == relation)
        result = await self.session.execute(query)
        edges = result.scalars().all()
        neighbors = []
        for e in edges:
            target_result = await self.session.execute(select(ComponentNode).where(ComponentNode.id == e.target_id))
            target = target_result.scalar()
            if target:
                neighbors.append({"node": target, "edge": e})
        return neighbors

    async def bfs_traverse(self, start_node_id: str, relations: list[str] | None = None, max_depth: int = 2) -> list[dict]:
        relations = relations or RELATION_TYPES
        visited = {start_node_id}
        queue = deque([(start_node_id, 0, [])])
        results = []

        while queue:
            current_id, depth, path = queue.popleft()
            if depth >= max_depth:
                continue
            query = select(ComponentEdge).where(
                ComponentEdge.source_id == current_id,
                ComponentEdge.relation.in_(relations),
            )
            result = await self.session.execute(query)
            for edge in result.scalars().all():
                if edge.target_id not in visited:
                    visited.add(edge.target_id)
                    target_result = await self.session.execute(
                        select(ComponentNode).where(ComponentNode.id == edge.target_id)
                    )
                    target = target_result.scalar()
                    if target:
                        new_path = path + [{"from": current_id, "relation": edge.relation, "to": edge.target_id}]
                        results.append({"node": target, "edge": edge, "depth": depth + 1, "path": new_path})
                        queue.append((edge.target_id, depth + 1, new_path))
        return results

    async def search_by_type(self, component_type: str, property_filters: dict | None = None, limit: int = 10) -> list[ComponentNode]:
        query = select(ComponentNode).where(ComponentNode.component_type == component_type)
        result = await self.session.execute(query.limit(limit))
        nodes = result.scalars().all()
        if property_filters:
            filtered = []
            for n in nodes:
                match = True
                for k, v in property_filters.items():
                    if str(n.properties.get(k, "")) != str(v):
                        match = False
                        break
                if match:
                    filtered.append(n)
            return filtered[:limit]
        return list(nodes)

    async def update_communities(self, community_map: dict[str, str]):
        for node_id, community in community_map.items():
            result = await self.session.execute(select(ComponentNode).where(ComponentNode.id == node_id))
            node = result.scalar()
            if node:
                node.community = community
        await self.session.flush()
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/core/knowledge_graph.py
git commit -m "feat: add ComponentGraph with CRUD, BFS traversal, and type search"
```

---

### Task 4: Implement entity_extractor.py — LLM entity and relation extraction from PDFs

**Files:**
- Create: `backend/app/core/entity_extractor.py`

- [ ] **Step 1: Write the EntityExtractor class**

```python
"""LLM-powered entity and relation extraction from PDF text for component knowledge graph."""
import json
from app.core.llm_service import llm_service


ENTITY_EXTRACTION_PROMPT = """You are an electrical component cataloger. From the following technical document text, extract all electrical/automation components mentioned.

For each component, return:
- name: exact model name/number (e.g. "SITOP PSU100C", "SM 1231 AI 8x13bit")
- component_type: one of [Sensor, PLC_CPU, PLC_DI, PLC_DO, PLC_AI, PLC_AO, Power_Supply, Circuit_Breaker, Contactor, Thermal_Overload, VFD, Safety_Relay, Terminal_Block, Actuator, Communication_Module, HMI, Motor, Other]
- properties: all technical specs found (rated_voltage, rated_current, power, output_signal, input_signal, protocol, resolution, channels, mounting, dimensions, etc.)

Output valid JSON array only, no markdown wrapping. Example:
[{"name": "SITOP PSU100C", "component_type": "Power_Supply", "properties": {"output_voltage": "24VDC", "rated_current": "2.5A", "power": "60W"}}]

Text:
{text}"""


RELATION_EXTRACTION_PROMPT = """You are an electrical engineering relationships analyst. Given a list of components extracted from a technical document, identify how they connect electrically.

Valid relation types:
- REQUIRES_POWER: component needs power supply (specify voltage)
- OUTPUTS_SIGNAL: sensor/meter outputs a signal to an input module (specify signal type: 4-20mA, 0-10V, etc.)
- USES_PROTOCOL: device communicates via a protocol (specify protocol: PROFINET, PROFIBUS, Modbus, etc.)
- COMPATIBLE_WITH: components are verified compatible together
- ALTERNATIVE_TO: one model can replace another
- MOUNTS_ON: component mounts on rail/panel (specify: DIN35, panel, etc.)
- CONTROLS: output module controls an actuator (specify: contactor coil, valve, etc.)

For each relationship, return:
- source: exact component name (must match one from the list below)
- target: exact component name (must match one from the list below)
- relation: one of the types above
- properties: relevant specs (voltage, signal_type, protocol, etc.)

Components:
{components_json}

Output valid JSON array only, no markdown wrapping."""


class EntityExtractor:
    async def extract_entities(self, text: str) -> list[dict]:
        chunk_size = 3000
        chunks = [text[i:i + chunk_size] for i in range(0, len(text), chunk_size)]
        all_entities = []
        seen_names = set()

        for chunk in chunks[:5]:  # max 5 chunks to control cost
            prompt = ENTITY_EXTRACTION_PROMPT.format(text=chunk)
            raw = await llm_service.chat("You extract electrical components as JSON.", prompt)
            raw = raw.strip().removeprefix("```json").removesuffix("```").strip()
            try:
                entities = json.loads(raw)
                for e in entities:
                    name = e.get("name", "")
                    if name and name not in seen_names:
                        seen_names.add(name)
                        all_entities.append(e)
            except json.JSONDecodeError:
                continue

        return all_entities

    async def extract_relations(self, entities: list[dict], context_text: str) -> list[dict]:
        components_json = json.dumps(entities, ensure_ascii=False, indent=2)
        prompt = RELATION_EXTRACTION_PROMPT.format(components_json=components_json)
        raw = await llm_service.chat("You extract electrical component relationships as JSON.", prompt)
        raw = raw.strip().removeprefix("```json").removesuffix("```").strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return []


entity_extractor = EntityExtractor()
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/core/entity_extractor.py
git commit -m "feat: add EntityExtractor for LLM-powered entity/relation extraction from PDFs"
```

---

### Task 5: Implement community_detector.py — NetworkX Louvain community detection

**Files:**
- Create: `backend/app/core/community_detector.py`

- [ ] **Step 1: Write the CommunityDetector class**

```python
"""Community detection on component knowledge graph using NetworkX Louvain."""
import networkx as nx
import community as community_louvain


class CommunityDetector:
    def detect(self, nodes: list[dict], edges: list[dict]) -> dict[str, str]:
        """Run Louvain community detection. nodes: [{id, name, component_type}], edges: [{source_id, target_id, relation}].
        Returns: {node_id: community_label}."""
        G = nx.Graph()
        for n in nodes:
            G.add_node(n["id"], label=n.get("name", ""), component_type=n.get("component_type", ""))
        for e in edges:
            G.add_edge(e["source_id"], e["target_id"], relation=e.get("relation", ""))

        if G.number_of_edges() < 2:
            return {n["id"]: "ungrouped" for n in nodes}

        partition = community_louvain.best_partition(G)

        named_communities = {}
        comm_nodes: dict[int, list[str]] = {}
        for node_id, comm_id in partition.items():
            comm_nodes.setdefault(comm_id, []).append(node_id)

        for comm_id, member_ids in comm_nodes.items():
            types = []
            for n in nodes:
                if n["id"] in member_ids:
                    types.append(n.get("component_type", ""))
            dominant = max(set(types), key=types.count) if types else "mixed"
            label = f"community_{comm_id}_{dominant}"
            for nid in member_ids:
                named_communities[nid] = label

        return named_communities
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/core/community_detector.py
git commit -m "feat: add CommunityDetector using NetworkX Louvain algorithm"
```

---

### Task 6: Integrate graph extraction into knowledge upload flow

**Files:**
- Modify: `backend/app/api/knowledge.py`

- [ ] **Step 1: Add graph extraction to upload_doc endpoint**

In `backend/app/api/knowledge.py`, add imports at top:

```python
from app.core.entity_extractor import entity_extractor
from app.core.knowledge_graph import ComponentGraph
from app.core.community_detector import CommunityDetector
```

After the existing line `await rag_engine.index_chunks(chunks, doc.id, {"manufacturer": manufacturer, "category_tags": tags})` (around line 38), add:

```python
    # Graph extraction path (runs in background, does not block response)
    import asyncio
    asyncio.create_task(_extract_graph_knowledge(text, doc.id, session))
```

Before `def extract_pdf_text`, add the helper:

```python
async def _extract_graph_knowledge(text: str, doc_id: str, session: AsyncSession):
    try:
        graph = ComponentGraph(session)
        entities = await entity_extractor.extract_entities(text)
        if not entities:
            return

        node_ids = {}
        node_list = []
        for ent in entities:
            node = await graph.upsert_node(
                name=ent["name"],
                component_type=ent["component_type"],
                properties=ent.get("properties", {}),
                source_doc_id=doc_id,
            )
            node_ids[ent["name"]] = node.id
            node_list.append({"id": node.id, "name": ent["name"], "component_type": ent["component_type"]})

        relations = await entity_extractor.extract_relations(entities, text[:4000])
        edge_list = []
        for rel in relations:
            src_id = node_ids.get(rel.get("source", ""))
            tgt_id = node_ids.get(rel.get("target", ""))
            if src_id and tgt_id:
                edge = await graph.add_edge(
                    source_id=src_id,
                    target_id=tgt_id,
                    relation=rel["relation"],
                    properties=rel.get("properties", {}),
                    confidence="extracted",
                    source_doc_id=doc_id,
                )
                edge_list.append({"source_id": src_id, "target_id": tgt_id, "relation": rel["relation"]})

        if node_list and edge_list:
            detector = CommunityDetector()
            communities = detector.detect(node_list, edge_list)
            await graph.update_communities(communities)

        await session.commit()
    except Exception:
        pass  # graph extraction failure should not break the upload
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/knowledge.py
git commit -m "feat: integrate graph entity/relation extraction into PDF upload flow"
```

---

### Task 7: Add search_with_graph_neighbors to RAGEngine

**Files:**
- Modify: `backend/app/core/rag_engine.py`

- [ ] **Step 1: Add the dual-search method to RAGEngine**

Add this method to the `RAGEngine` class (before the last line `rag_engine = RAGEngine()`):

```python
    async def search_with_graph(self, query: str, component_type: str, top_k: int, session) -> list[dict]:
        """Dual-path search: Qdrant semantic + graph neighbor lookup."""
        from app.core.knowledge_graph import ComponentGraph
        results = await self.search(query, top_k=top_k)
        for r in results:
            r["source"] = "qdrant"

        graph = ComponentGraph(session)
        graph_nodes = await graph.search_by_type(component_type, limit=top_k)
        seen_names = {r.get("content", "")[:60] for r in results}
        for node in graph_nodes:
            name_snippet = f"{node.name}: {node.component_type}"
            if name_snippet not in seen_names:
                results.append({
                    "id": node.id,
                    "content": f"{node.name} ({node.component_type}) — {node.properties}",
                    "score": 1.0,
                    "metadata": {"name": node.name, "component_type": node.component_type, **node.properties},
                    "source": "graph",
                })
        return results[:top_k + 3]
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/core/rag_engine.py
git commit -m "feat: add dual-path search (Qdrant + graph) to RAGEngine"
```

---

### Task 8: Create LangGraph state, graph module skeleton, and builder

**Files:**
- Create: `backend/app/core/graph/__init__.py`
- Create: `backend/app/core/graph/state.py`
- Create: `backend/app/core/graph/builder.py`

- [ ] **Step 1: Create __init__.py**

```python
# backend/app/core/graph/__init__.py
from app.core.graph.builder import build_graph
```

- [ ] **Step 2: Create state.py with AnalysisState**

```python
# backend/app/core/graph/state.py
from typing import TypedDict


class AnalysisState(TypedDict):
    project_id: str
    user_input: str
    requirement: dict | None
    categories: list[str] | None
    safety_level: str | None
    constraints: dict | None
    bom_items: list[dict] | None
    violations: list[dict] | None
    mermaid_code: str | None
    st_modules: list[dict] | None
    review_notes: list[str] | None
    graph_traces: list[dict]
    errors: list[str]
    stage: str
```

- [ ] **Step 3: Create builder.py with StateGraph construction**

```python
# backend/app/core/graph/builder.py
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite import SqliteSaver
from app.core.graph.state import AnalysisState
from app.core.graph.agents import (
    requirements_agent,
    category_mapper,
    safety_assessor,
    constraint_extractor,
    fanout_selection_supervisor,
    rule_validator,
    schematic_generator,
    code_generator,
    final_review_agent,
)


def build_graph(checkpoint_db: str = "checkpoints.db"):
    workflow = StateGraph(AnalysisState)

    workflow.add_node("requirements_agent", requirements_agent)
    workflow.add_node("category_mapper", category_mapper)
    workflow.add_node("safety_assessor", safety_assessor)
    workflow.add_node("constraint_extractor", constraint_extractor)
    workflow.add_node("selection_supervisor", fanout_selection_supervisor)
    workflow.add_node("rule_validator", rule_validator)
    workflow.add_node("schematic_generator", schematic_generator)
    workflow.add_node("code_generator", code_generator)
    workflow.add_node("final_review_agent", final_review_agent)

    workflow.set_entry_point("requirements_agent")
    workflow.add_edge("requirements_agent", "category_mapper")
    workflow.add_edge("requirements_agent", "safety_assessor")
    workflow.add_edge("requirements_agent", "constraint_extractor")
    workflow.add_edge("category_mapper", "selection_supervisor")
    workflow.add_edge("safety_assessor", "selection_supervisor")
    workflow.add_edge("constraint_extractor", "selection_supervisor")
    workflow.add_edge("selection_supervisor", "rule_validator")
    workflow.add_edge("rule_validator", "schematic_generator")
    workflow.add_edge("rule_validator", "code_generator")
    workflow.add_edge("rule_validator", "final_review_agent")
    workflow.add_edge("schematic_generator", END)
    workflow.add_edge("code_generator", END)
    workflow.add_edge("final_review_agent", END)

    checkpointer = SqliteSaver.from_conn_string(checkpoint_db)
    return workflow.compile(checkpointer=checkpointer)
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/graph/__init__.py backend/app/core/graph/state.py backend/app/core/graph/builder.py
git commit -m "feat: add LangGraph state definition and graph builder skeleton"
```

---

### Task 9: Implement LangGraph agent node functions

**Files:**
- Create: `backend/app/core/graph/agents.py`

- [ ] **Step 1: Write all agent node functions**

```python
# backend/app/core/graph/agents.py
"""LangGraph agent node functions — each node receives state, returns partial state update."""
import json
from app.core.graph.state import AnalysisState
from app.core.llm_service import llm_service
from app.core.rule_engine import validate_all


async def requirements_agent(state: AnalysisState) -> dict:
    req = await llm_service.analyze_requirements(state["user_input"])
    return {
        "requirement": req,
        "safety_level": req.get("safety_level"),
        "stage": "requirements_done",
        "graph_traces": state.get("graph_traces", []),
    }


async def category_mapper(state: AnalysisState) -> dict:
    req = state.get("requirement", {})
    io_list = req.get("io_list", [])
    logic_list = req.get("control_logic", [])
    categories = await llm_service.map_categories(io_list, logic_list)
    return {"categories": categories, "graph_traces": state.get("graph_traces", [])}


async def safety_assessor(state: AnalysisState) -> dict:
    req = state.get("requirement", {})
    sil = req.get("safety_level", "SIL1")
    return {"safety_level": sil, "graph_traces": state.get("graph_traces", [])}


async def constraint_extractor(state: AnalysisState) -> dict:
    req = state.get("requirement", {})
    constraints = {
        "plc_family": req.get("plc_family", "S7-1200"),
        "budget": req.get("budget"),
        "cabinet_size": req.get("cabinet_size"),
    }
    return {"constraints": constraints, "graph_traces": state.get("graph_traces", [])}


async def fanout_selection_supervisor(state: AnalysisState) -> dict:
    """Fan-out: for each category, search RAG + graph neighbors in sequence (async gather not feasible inside node)."""
    from app.core.rag_engine import rag_engine
    from app.db.repository import async_session

    categories = state.get("categories", [])
    all_bom = []
    all_traces = list(state.get("graph_traces", []))

    async with async_session() as session:
        for cat in categories:
            results = await rag_engine.search_with_graph(
                f"select {cat} for industrial automation",
                component_type=cat,
                top_k=3,
                session=session,
            )
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
                    all_traces.append({"category": cat, "node_id": best.get("id"), "component": best.get("content", "")[:60]})

    return {
        "bom_items": all_bom,
        "graph_traces": all_traces,
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
    return {"violations": violations, "graph_traces": state.get("graph_traces", [])}


async def schematic_generator(state: AnalysisState) -> dict:
    bom = state.get("bom_items", [])
    req = state.get("requirement", {})
    bom_list = [{"category": i["category"], "manufacturer": i["manufacturer"], "model": i["model"]} for i in bom]
    req_data = {
        "machine_type": req.get("machine_type"),
        "safety_level": req.get("safety_level"),
    }
    mermaid = await llm_service.generate_schematic_mermaid(bom_list, req_data)
    return {"mermaid_code": mermaid, "graph_traces": state.get("graph_traces", [])}


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
    return {"st_modules": modules, "graph_traces": state.get("graph_traces", [])}


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
    return {"review_notes": notes, "graph_traces": state.get("graph_traces", [])}
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/core/graph/agents.py
git commit -m "feat: implement all 9 LangGraph agent node functions"
```

---

### Task 10: Create the unified /analyze-v2 endpoint

**Files:**
- Modify: `backend/app/core/orchestrator.py`
- Modify: `backend/app/api/analysis.py`

- [ ] **Step 1: Add graph-based run method to Orchestrator**

In `backend/app/core/orchestrator.py`, add after the `run_analysis` method and before `orchestrator = Orchestrator()`:

```python
    async def run_graph_analysis(self, project_id: str, user_input: str) -> dict:
        from app.core.graph.builder import build_graph
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
        }
        final_state = await graph.ainvoke(initial_state, config)
        return final_state
```

- [ ] **Step 2: Add /analyze-v2 endpoint**

In `backend/app/api/analysis.py`, add a new endpoint:

```python
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
        session.add(BOMItem(project_id=project_id, **{k: v for k, v in item_data.items() if k in [
            "category", "manufacturer", "model", "quantity", "specifications", "confidence",
            "source_chunk_id", "alternatives"
        ]}))

    mermaid = final_state.get("mermaid_code")
    if mermaid:
        session.add(Schematic(project_id=project_id, mermaid_code=mermaid))

    for i, mod in enumerate(final_state.get("st_modules", [])):
        session.add(STModule(
            project_id=project_id,
            name=mod["name"],
            module_type=mod["module_type"],
            code=mod["code"],
            sort_order=mod.get("sort_order", i),
        ))

    project.status = "done"
    await session.commit()
    await session.refresh(project)
    return project
```

Add missing imports at top of `analysis.py`:

```python
from app.db.models import IOItem, LogicRule, BOMItem, Schematic, STModule
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/orchestrator.py backend/app/api/analysis.py
git commit -m "feat: add /analyze-v2 endpoint using LangGraph graph execution"
```

---

### Task 11: Frontend — Design tokens and theme system

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/tailwind.config.js`

- [ ] **Step 1: Replace index.css with design token system**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --color-bg-primary: #fafafa;
  --color-bg-secondary: #ffffff;
  --color-bg-tertiary: #f5f5f4;
  --color-text-primary: #1a1a2e;
  --color-text-secondary: #6b7280;
  --color-text-tertiary: #9ca3af;
  --color-border: #e5e7eb;
  --color-border-light: #f3f4f6;
  --color-accent: #2563eb;
  --color-accent-hover: #1d4ed8;
  --color-accent-light: #eff6ff;
  --color-success: #059669;
  --color-success-light: #ecfdf5;
  --color-warning: #d97706;
  --color-warning-light: #fffbeb;
  --color-error: #dc2626;
  --color-error-light: #fef2f2;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04);
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}

[data-theme="dark"] {
  --color-bg-primary: #0d1117;
  --color-bg-secondary: #161b22;
  --color-bg-tertiary: #21262d;
  --color-text-primary: #e6edf3;
  --color-text-secondary: #8b949e;
  --color-text-tertiary: #6e7681;
  --color-border: #30363d;
  --color-border-light: #21262d;
  --color-accent: #58a6ff;
  --color-accent-hover: #79c0ff;
  --color-accent-light: #0d419d;
  --color-success: #3fb950;
  --color-success-light: #04260f;
  --color-warning: #d2991d;
  --color-warning-light: #2e2200;
  --color-error: #f85149;
  --color-error-light: #310606;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}
```

- [ ] **Step 2: Update tailwind.config.js to use CSS variables**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        'app-bg-primary': 'var(--color-bg-primary)',
        'app-bg-secondary': 'var(--color-bg-secondary)',
        'app-bg-tertiary': 'var(--color-bg-tertiary)',
        'app-text-primary': 'var(--color-text-primary)',
        'app-text-secondary': 'var(--color-text-secondary)',
        'app-text-tertiary': 'var(--color-text-tertiary)',
        'app-border': 'var(--color-border)',
        'app-border-light': 'var(--color-border-light)',
        'app-accent': 'var(--color-accent)',
        'app-accent-hover': 'var(--color-accent-hover)',
        'app-accent-light': 'var(--color-accent-light)',
        'app-success': 'var(--color-success)',
        'app-success-light': 'var(--color-success-light)',
        'app-warning': 'var(--color-warning)',
        'app-warning-light': 'var(--color-warning-light)',
        'app-error': 'var(--color-error)',
        'app-error-light': 'var(--color-error-light)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'app-sm': 'var(--radius-sm)',
        'app-md': 'var(--radius-md)',
        'app-lg': 'var(--radius-lg)',
      },
      boxShadow: {
        'app-sm': 'var(--shadow-sm)',
        'app-md': 'var(--shadow-md)',
        'app-lg': 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css frontend/tailwind.config.js
git commit -m "feat: add design token system with light/dark theme support"
```

---

### Task 12: Frontend — ThemeToggle component and theme state

**Files:**
- Create: `frontend/src/views/components/ThemeToggle.tsx`
- Modify: `frontend/src/models/store.ts`

- [ ] **Step 1: Add theme to Zustand store**

In `frontend/src/models/store.ts`, add to the `AppState` interface:

```typescript
  theme: 'light' | 'dark';
  toggleTheme: () => void;
```

Add to the `create` call:

```typescript
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
  toggleTheme: () => set((s) => {
    const next = s.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
    return { theme: next };
  }),
```

- [ ] **Step 2: Create ThemeToggle component**

```tsx
// frontend/src/views/components/ThemeToggle.tsx
import { useStore } from '../../models/store';

export function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-app-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      aria-label="Toggle theme"
    >
      {theme === 'light' ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 1.5a6.5 6.5 0 1 0 4.6 1.9 6.5 6.5 0 0 0-4.6-1.9zM8 3v10a4 4 0 1 0 0-8z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="3.5" />
          <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
        </svg>
      )}
    </button>
  );
}
```

- [ ] **Step 3: Initialize theme on app load**

In `frontend/src/main.tsx`, add before `ReactDOM.createRoot`:

```tsx
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/components/ThemeToggle.tsx frontend/src/models/store.ts frontend/src/main.tsx
git commit -m "feat: add ThemeToggle component and theme state management"
```

---

### Task 13: Frontend — Update AppLayout with theme and ThemeToggle

**Files:**
- Modify: `frontend/src/views/components/AppLayout.tsx`

- [ ] **Step 1: Rewrite AppLayout with CSS variable classes and ThemeToggle**

```tsx
import { useState } from 'react';
import { ChatPanel } from './ChatPanel';
import { CanvasPanel } from './CanvasPanel';
import { KnowledgePanel } from './KnowledgePanel';
import { ThemeToggle } from './ThemeToggle';

export function AppLayout() {
  const [leftTab, setLeftTab] = useState<'chat' | 'knowledge'>('chat');
  const [leftWidth, setLeftWidth] = useState(30);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);

  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-[var(--color-bg-primary)]"
      onMouseMove={(e) => {
        if (!isDragging) return;
        const pct = (e.clientX / window.innerWidth) * 100;
        setLeftWidth(Math.max(20, Math.min(50, pct)));
      }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className="flex flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
        style={{ width: `${leftWidth}%`, minWidth: 280 }}
      >
        <div className="flex items-center border-b border-[var(--color-border)]">
          <button
            onClick={() => setLeftTab('chat')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              leftTab === 'chat'
                ? 'bg-[var(--color-bg-primary)] border-b-2 border-[var(--color-accent)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setLeftTab('knowledge')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              leftTab === 'knowledge'
                ? 'bg-[var(--color-bg-primary)] border-b-2 border-[var(--color-accent)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Knowledge
          </button>
          <ThemeToggle />
        </div>
        <div className="flex-1 overflow-hidden">
          {leftTab === 'chat' ? <ChatPanel /> : <KnowledgePanel />}
        </div>
      </div>

      <div
        className="w-1 cursor-col-resize hover:bg-[var(--color-accent)] transition-colors shrink-0"
        onMouseDown={handleMouseDown}
      />

      <div className="flex-1 flex flex-col bg-[var(--color-bg-primary)]">
        <CanvasPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/components/AppLayout.tsx
git commit -m "feat: update AppLayout with theme support, ThemeToggle, and resizable panels"
```

---

### Task 14: Frontend — Update remaining components with theme classes

**Files:**
- Modify: `frontend/src/views/components/ChatPanel.tsx`
- Modify: `frontend/src/views/components/ChatMessage.tsx`
- Modify: `frontend/src/views/components/ChatInput.tsx`
- Modify: `frontend/src/views/components/CanvasPanel.tsx`
- Modify: `frontend/src/views/components/BOMTable.tsx`
- Modify: `frontend/src/views/components/ProgressStepper.tsx`
- Modify: `frontend/src/views/components/KnowledgePanel.tsx`

- [ ] **Step 1: Read each component and replace hardcoded Tailwind colors with CSS variable classes**

Pattern: Replace `bg-white` → `bg-[var(--color-bg-secondary)]`, `text-gray-500` → `text-[var(--color-text-secondary)]`, `border-gray-200` → `border-[var(--color-border)]`, etc.

Key replacements:
- `bg-white` → `bg-[var(--color-bg-secondary)]`
- `bg-gray-50` → `bg-[var(--color-bg-primary)]`
- `bg-gray-100` → `bg-[var(--color-bg-tertiary)]`
- `text-gray-500` → `text-[var(--color-text-secondary)]`
- `text-gray-900` / `text-black` → `text-[var(--color-text-primary)]`
- `border-gray-200` / `border-gray-300` → `border-[var(--color-border)]`
- `bg-blue-600` → `bg-[var(--color-accent)]`
- `text-blue-600` → `text-[var(--color-accent)]`
- `bg-green-100` → `bg-[var(--color-success-light)]`
- `text-green-700` → `text-[var(--color-success)]`
- `bg-yellow-100` → `bg-[var(--color-warning-light)]`
- `text-yellow-700` → `text-[var(--color-warning)]`
- `bg-red-100` → `bg-[var(--color-error-light)]`
- `text-red-700` → `text-[var(--color-error)]`

- [ ] **Step 2: Update ChatMessage to use Notion-like bubble style**

```tsx
// ChatMessage.tsx - update the message bubble
<div className={`px-4 py-2.5 rounded-app-lg text-sm leading-relaxed ${
  role === 'user'
    ? 'bg-[var(--color-accent)] text-white ml-8'
    : role === 'system'
    ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] text-xs mx-4'
    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] mr-8'
}`}>
  {content}
</div>
```

- [ ] **Step 3: Update CanvasPanel with VS Code-style tab bar**

Replace tab buttons with this pattern:
```tsx
<button
  onClick={() => setActiveTab(tab)}
  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
    activeTab === tab
      ? 'border-[var(--color-accent)] text-[var(--color-text-primary)]'
      : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
  }`}
>
  {label}
</button>
```

- [ ] **Step 4: Update BOMTable with Linear-like styling**

```tsx
// BOMTable.tsx - table row hover
<tr className="border-b border-[var(--color-border-light)] hover:bg-[var(--color-bg-tertiary)] transition-colors">
  {/* cells */}
</tr>
// Confidence badge
<span className={`inline-flex items-center px-2 py-0.5 rounded-app-sm text-xs font-medium ${
  item.confidence === 'rag' || item.confidence === 'graph'
    ? 'bg-[var(--color-success-light)] text-[var(--color-success)]'
    : 'bg-[var(--color-warning-light)] text-[var(--color-warning)]'
}`}>
  {item.confidence}
</span>
```

- [ ] **Step 5: Update ProgressStepper with Linear-like thin line**

```tsx
<div className="flex items-center gap-1.5 px-4 py-2">
  <div className={`h-0.5 flex-1 rounded ${
    active ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
  }`} />
  <span className={`text-xs ${active ? 'text-[var(--color-accent)] font-medium' : 'text-[var(--color-text-tertiary)]'}`}>
    {label}
  </span>
</div>
```

- [ ] **Step 6: Update KnowledgePanel with card grid layout**

```tsx
<div className="grid grid-cols-1 gap-3 p-4">
  {docs.map((doc) => (
    <div key={doc.id} className="rounded-app-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-app-sm hover:shadow-app-md transition-shadow">
      {/* doc info */}
    </div>
  ))}
</div>
```

- [ ] **Step 7: Read and update each component file individually, then commit**

```bash
git add frontend/src/views/components/
git commit -m "feat: update all frontend components with theme CSS variable classes and improved styling"
```

---

### Task 15: Final integration test and verification

**Files:**
- Verify: `backend/tests/`

- [ ] **Step 1: Verify backend tests pass**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All existing tests pass.

- [ ] **Step 2: Verify backend starts**

Run: `cd backend && PYTHONPATH=. python -c "from app.main import app; print('FastAPI app loaded OK')"`
Expected: "FastAPI app loaded OK"

- [ ] **Step 3: Verify LangGraph graph builds**

Run: `cd backend && PYTHONPATH=. python -c "from app.core.graph.builder import build_graph; g = build_graph(':memory:'); print('Graph compiled OK:', g.name if hasattr(g, 'name') else 'graph')"`
Expected: "Graph compiled OK"

- [ ] **Step 4: Verify frontend builds**

Run: `cd frontend && npx tsc --noEmit && npx vite build`
Expected: TypeScript passes, build succeeds.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: verify all tests pass, app loads, and frontend builds" --allow-empty
```

---

### Task 16: Run graphify update per CLAUDE.md

**Files:**
- None (graph update only)

- [ ] **Step 1: Update knowledge graph**

Run: `cd "c:/Users/roarp/Desktop/TMP/Code/AICode/Ele" && graphify update .`

- [ ] **Step 2: Verify graph report updated**

Run: `ls -la graphify-out/GRAPH_REPORT.md`
Expected: File modified timestamp is current.

- [ ] **Step 3: Commit**

```bash
git add graphify-out/
git commit -m "chore: update graphify knowledge graph after major refactor"
```

---

## Summary

**Total: 16 tasks** across 4 phases:

| Phase | Tasks | Files Created | Files Modified |
|-------|-------|---------------|----------------|
| Phase 0 (Graph Schema) | Tasks 1-6 | 3 | 3 |
| Phase 1 (Infrastructure) | Tasks 7-8 | 4 | 1 |
| Phase 2 (Agent Migration) | Tasks 9-10 | 1 | 2 |
| Phase 3 (Frontend) | Tasks 11-15 | 1 | 9+ |
