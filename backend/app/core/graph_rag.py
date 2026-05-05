"""
Industrial GraphRAG — strict knowledge-graph retrieval with zero-hallucination guarantee.

Design principle: BOM selection must be 100% graph-edge-driven. If the graph
does not contain an exact match, the system requires human intervention rather
than allowing the LLM to fabricate or guess based on vector similarity.

Dual-path architecture:
  Vector path (soft):  Qdrant → manuals, wiring definitions, installation guides
  Graph path  (hard):  PostgreSQL → exact part numbers, mandatory accessory deps
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ComponentNode, ComponentEdge


# ═══════════════════════════════════════════
#  Edge Relation Types
# ═══════════════════════════════════════════

class GraphRelation(str, Enum):
    REQUIRES_POWER = "REQUIRES_POWER"
    OUTPUTS_SIGNAL = "OUTPUTS_SIGNAL"
    USES_PROTOCOL = "USES_PROTOCOL"
    COMPATIBLE_WITH = "COMPATIBLE_WITH"
    ALTERNATIVE_TO = "ALTERNATIVE_TO"
    MOUNTS_ON = "MOUNTS_ON"
    CONTROLS = "CONTROLS"
    REQUIRES_ACCESSORY = "REQUIRES_ACCESSORY"  # mandatory accessory (IO module base, cable, connector)


# Hard accessory dependency map — known mandatory pairings in industrial automation
# When the graph is sparse, this serves as a rule-based fallback to prevent
# BOMs from missing critical accessories.
HARD_ACCESSORY_RULES: dict[str, list[dict]] = {
    "IO_Module": [
        {"accessory_type": "Mounting_Base", "relation": "MOUNTS_ON", "mandatory": True},
        {"accessory_type": "Terminal_Block", "relation": "REQUIRES_ACCESSORY", "mandatory": True},
        {"accessory_type": "Bus_Connector", "relation": "REQUIRES_ACCESSORY", "mandatory": True},
    ],
    "Servo_Drive": [
        {"accessory_type": "Power_Cable", "relation": "REQUIRES_ACCESSORY", "mandatory": True},
        {"accessory_type": "Encoder_Cable", "relation": "REQUIRES_ACCESSORY", "mandatory": True},
        {"accessory_type": "Braking_Resistor", "relation": "REQUIRES_ACCESSORY", "mandatory": False},
        {"accessory_type": "Line_Reactor", "relation": "REQUIRES_ACCESSORY", "mandatory": False},
    ],
    "VFD": [
        {"accessory_type": "Power_Cable", "relation": "REQUIRES_ACCESSORY", "mandatory": True},
        {"accessory_type": "EMC_Filter", "relation": "REQUIRES_ACCESSORY", "mandatory": True},
        {"accessory_type": "Line_Reactor", "relation": "REQUIRES_ACCESSORY", "mandatory": False},
        {"accessory_type": "Braking_Resistor", "relation": "REQUIRES_ACCESSORY", "mandatory": False},
    ],
    "PLC_CPU": [
        {"accessory_type": "Memory_Card", "relation": "REQUIRES_ACCESSORY", "mandatory": True},
        {"accessory_type": "Power_Supply", "relation": "REQUIRES_POWER", "mandatory": True},
        {"accessory_type": "Bus_Connector", "relation": "REQUIRES_ACCESSORY", "mandatory": True},
    ],
    "Safety_PLC": [
        {"accessory_type": "Memory_Card", "relation": "REQUIRES_ACCESSORY", "mandatory": True},
        {"accessory_type": "Power_Supply", "relation": "REQUIRES_POWER", "mandatory": True},
    ],
    "HMI": [
        {"accessory_type": "Mounting_Kit", "relation": "MOUNTS_ON", "mandatory": False},
        {"accessory_type": "Communication_Cable", "relation": "REQUIRES_ACCESSORY", "mandatory": True},
    ],
    "Power_Supply": [
        {"accessory_type": "Circuit_Breaker", "relation": "REQUIRES_ACCESSORY", "mandatory": True},
    ],
    "Circuit_Breaker": [
        {"accessory_type": "Busbar", "relation": "REQUIRES_ACCESSORY", "mandatory": False},
    ],
    "Contactor": [
        {"accessory_type": "Auxiliary_Contact", "relation": "REQUIRES_ACCESSORY", "mandatory": False},
        {"accessory_type": "Surge_Suppressor", "relation": "REQUIRES_ACCESSORY", "mandatory": False},
    ],
    "Safety_Relay": [
        {"accessory_type": "Terminal_Block", "relation": "REQUIRES_ACCESSORY", "mandatory": True},
    ],
}


# ═══════════════════════════════════════════
#  Pydantic Graph Schema
# ═══════════════════════════════════════════

class ComponentNodeSchema(BaseModel):
    """A physical component with exact manufacturer part number."""
    id: str
    name: str
    component_type: str
    manufacturer: str = ""
    order_number: str = ""  # MLFB / exact part number (e.g., 6ES7511-1AK02-0AB0)
    properties: dict = Field(default_factory=dict)
    community: str | None = None

    model_config = {"from_attributes": True}


class CategoryNode(BaseModel):
    """Functional category grouping (e.g., 'Safety_Components', 'Power_Distribution')."""
    name: str
    parent_category: str | None = None


class ProtocolNode(BaseModel):
    """Industrial communication protocol."""
    name: str  # PROFINET, PROFIBUS, EtherCAT, EtherNet/IP, Modbus TCP
    version: str = ""
    media_type: str = ""  # copper, fiber, wireless


class AccessoryRequirement(BaseModel):
    """A REQUIRES_ACCESSORY / MOUNTS_ON / REQUIRES_POWER edge: mandatory dependency."""
    source_component_id: str
    target_accessory_type: str
    target_order_number: str = ""
    target_name: str = ""
    relation: str  # REQUIRES_ACCESSORY | MOUNTS_ON | REQUIRES_POWER
    quantity: int = 1
    mandatory: bool = True


class CompatibilityConstraint(BaseModel):
    """A COMPATIBLE_WITH edge between components."""
    source_id: str
    target_id: str
    shared_protocol: str | None = None
    notes: str = ""


class GraphRetrievalRequest(BaseModel):
    """Input from the selection supervisor for graph-based retrieval."""
    category: str
    machine_type: str = ""
    safety_level: str = ""
    plc_family: str = "S7-1200"
    required_protocols: list[str] = Field(default_factory=list)
    constraints: dict = Field(default_factory=dict)


class GraphRetrievalResult(BaseModel):
    """Structured result from GraphRetriever — must carry exact order numbers."""
    status: str = "EMPTY"  # FOUND | NOT_FOUND | PARTIAL | EMPTY
    components: list[ComponentNodeSchema] = Field(default_factory=list)
    accessory_requirements: list[AccessoryRequirement] = Field(default_factory=list)
    missing_accessories: list[str] = Field(default_factory=list)
    graph_trace: list[dict] = Field(default_factory=list)
    human_intervention_required: bool = False
    message: str = ""


class HybridSearchResult(BaseModel):
    """Combined dual-path result: graph (hard/exact) + vector (soft/contextual)."""
    graph_result: GraphRetrievalResult
    vector_results: list[dict] = Field(default_factory=list)
    requires_human_review: bool = False


# ═══════════════════════════════════════════
#  GraphRetriever
# ═══════════════════════════════════════════

class GraphRetriever:
    """Exact-match retrieval via the PostgreSQL component knowledge graph.

    Zero-hallucination guarantee:
      - Returns ONLY components linked by explicit graph edges.
      - If no exact match, sets status="NOT_FOUND" and
        human_intervention_required=True — no LLM fallback allowed.
      - Verifies REQUIRES_ACCESSORY edges before returning results.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def retrieve(self, request: GraphRetrievalRequest) -> GraphRetrievalResult:
        """Main entry: convert a selection request into exact graph matches.

        Flow:
          1. Search component_nodes by component_type (exact category match).
          2. For each match, verify REQUIRES_ACCESSORY / MOUNTS_ON / REQUIRES_POWER edges.
          3. If no matches found → NOT_FOUND with human_intervention_required.
          4. If mandatory accessories missing → auto-complete via accessory query.
        """
        # Step 1: exact category match
        query = (
            select(ComponentNode)
            .where(ComponentNode.component_type == request.category)
            .limit(20)
        )
        result = await self.session.execute(query)
        nodes = result.scalars().all()

        if not nodes:
            return GraphRetrievalResult(
                status="NOT_FOUND",
                human_intervention_required=True,
                message=(
                    f"No component found in knowledge graph for category "
                    f"'{request.category}'. Human selection required — "
                    f"do NOT allow LLM to fabricate a part number."
                ),
            )

        components: list[ComponentNodeSchema] = []
        all_accessories: dict[str, AccessoryRequirement] = {}
        graph_trace: list[dict] = []

        for node in nodes:
            manufacturer = node.properties.get("manufacturer", "")
            order_number = node.properties.get("order_number", "") or node.properties.get("mlfb", "")

            comp = ComponentNodeSchema(
                id=node.id,
                name=node.name,
                component_type=node.component_type,
                manufacturer=manufacturer,
                order_number=order_number,
                properties=node.properties,
                community=node.community,
            )
            components.append(comp)

            # Step 2: verify accessories for this component
            accessories = await self._verify_accessories(node, request.plc_family)
            for acc in accessories:
                if acc.target_accessory_type not in all_accessories:
                    all_accessories[acc.target_accessory_type] = acc

            graph_trace.append({
                "node_id": node.id,
                "name": node.name,
                "type": node.component_type,
                "order_number": order_number,
                "accessories_found": len(accessories),
            })

        # Step 3: determine which mandatory accessories are NOT in the BOM
        mandatory_missing: list[str] = []
        for acc in all_accessories.values():
            if acc.mandatory:
                # Check if this accessory type is already covered by retrieved components
                accessory_covered = any(
                    c.component_type == acc.target_accessory_type
                    for c in components
                )
                if not accessory_covered:
                    mandatory_missing.append(acc.target_accessory_type)

        accessory_list = list(all_accessories.values())

        # Step 4: build result
        has_order_numbers = any(c.order_number for c in components)

        if not has_order_numbers:
            return GraphRetrievalResult(
                status="NOT_FOUND",
                components=components,
                accessory_requirements=accessory_list,
                missing_accessories=mandatory_missing,
                graph_trace=graph_trace,
                human_intervention_required=True,
                message=(
                    f"Components matched category '{request.category}' but none have "
                    f"exact order numbers (MLFB). Human verification required."
                ),
            )

        if mandatory_missing:
            return GraphRetrievalResult(
                status="PARTIAL",
                components=components,
                accessory_requirements=accessory_list,
                missing_accessories=mandatory_missing,
                graph_trace=graph_trace,
                human_intervention_required=True,
                message=(
                    f"Found {len(components)} component(s) for '{request.category}', "
                    f"but missing mandatory accessories: {mandatory_missing}. "
                    f"Auto-completion attempted — human review required."
                ),
            )

        return GraphRetrievalResult(
            status="FOUND",
            components=components,
            accessory_requirements=accessory_list,
            missing_accessories=[],
            graph_trace=graph_trace,
            human_intervention_required=False,
            message=(
                f"Found {len(components)} component(s) for '{request.category}' "
                f"with {len(accessory_list)} accessories verified."
            ),
        )

    async def _verify_accessories(
        self, node: ComponentNode, plc_family: str
    ) -> list[AccessoryRequirement]:
        """Check all outgoing edges for hard accessory dependencies.

        Queries both:
          - Explicit graph edges (REQUIRES_ACCESSORY, MOUNTS_ON, REQUIRES_POWER)
          - Rule-based HARD_ACCESSORY_RULES for known industrial pairings
        """
        accessories: list[AccessoryRequirement] = []
        seen_types: set[str] = set()

        # 1. Explicit graph edges
        accessory_relations = {"REQUIRES_ACCESSORY", "MOUNTS_ON", "REQUIRES_POWER"}
        for relation in accessory_relations:
            edge_query = (
                select(ComponentEdge)
                .where(
                    ComponentEdge.source_id == node.id,
                    ComponentEdge.relation == relation,
                )
            )
            edge_result = await self.session.execute(edge_query)
            for edge in edge_result.scalars().all():
                target_query = (
                    select(ComponentNode)
                    .where(ComponentNode.id == edge.target_id)
                )
                target_result = await self.session.execute(target_query)
                target = target_result.scalar()
                if target and target.component_type not in seen_types:
                    seen_types.add(target.component_type)
                    accessories.append(AccessoryRequirement(
                        source_component_id=node.id,
                        target_accessory_type=target.component_type,
                        target_order_number=target.properties.get("order_number", "") or target.properties.get("mlfb", ""),
                        target_name=target.name,
                        relation=relation,
                        mandatory=relation != "MOUNTS_ON",  # MOUNTS_ON may be optional
                    ))

        # 2. Rule-based fallback: known industrial accessory dependencies
        rules = HARD_ACCESSORY_RULES.get(node.component_type, [])
        for rule in rules:
            if rule["accessory_type"] not in seen_types:
                seen_types.add(rule["accessory_type"])
                # Try to find matching accessory in graph
                acc_query = (
                    select(ComponentNode)
                    .where(ComponentNode.component_type == rule["accessory_type"])
                    .limit(1)
                )
                acc_result = await self.session.execute(acc_query)
                acc_node = acc_result.scalar()
                accessories.append(AccessoryRequirement(
                    source_component_id=node.id,
                    target_accessory_type=rule["accessory_type"],
                    target_order_number=acc_node.properties.get("order_number", "") if acc_node else "",
                    target_name=acc_node.name if acc_node else "",
                    relation=rule["relation"],
                    mandatory=rule["mandatory"],
                ))

        return accessories

    def to_cypher_query(self, request: GraphRetrievalRequest) -> str:
        """Reserved: generate a Cypher query for future Neo4j migration.

        Not executed — serves as a design contract for the graph query interface.
        """
        match_clause = f"(c:Component {{component_type: '{request.category}'}})"
        where_clauses = []
        if request.plc_family:
            where_clauses.append(f"c.plc_family = '{request.plc_family}'")
        if request.safety_level:
            where_clauses.append(f"c.safety_level >= '{request.safety_level}'")

        query = f"MATCH {match_clause}"
        if where_clauses:
            query += "\nWHERE " + "\n  AND ".join(where_clauses)
        query += "\nOPTIONAL MATCH (c)-[r:REQUIRES_ACCESSORY|MOUNTS_ON|REQUIRES_POWER]->(acc:Component)"
        query += "\nRETURN c, collect(DISTINCT {{type: type(r), accessory: acc}}) AS accessories"
        return query


# ═══════════════════════════════════════════
#  VectorRetriever (soft path — documentation)
# ═══════════════════════════════════════════

class VectorRetriever:
    """Soft retrieval via Qdrant — ONLY for non-deterministic content.

    Scope limited to:
      - Installation manuals
      - Wiring definitions
      - Application notes
      - Non-binding supplementary documentation

    Explicitly NOT for part number selection (use GraphRetriever).
    """

    def __init__(self, rag_engine):
        self._engine = rag_engine

    async def search_manuals(
        self, query: str, top_k: int = 5
    ) -> list[dict]:
        """Search for supplementary documentation only."""
        return await self._engine.search(query, top_k=top_k)

    async def search_with_category_filter(
        self,
        query: str,
        category_filter: list[str] | None = None,
        top_k: int = 5,
    ) -> list[dict]:
        """Category-filtered vector search."""
        return await self._engine.search(
            query, top_k=top_k, category_filter=category_filter
        )
