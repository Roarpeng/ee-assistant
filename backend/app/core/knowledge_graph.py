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
    "REQUIRES_ACCESSORY",
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
