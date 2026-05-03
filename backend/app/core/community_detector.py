"""Community detection on component knowledge graph using NetworkX Louvain."""
import networkx as nx
import community as community_louvain


class CommunityDetector:
    def detect(self, nodes: list[dict], edges: list[dict]) -> dict[str, str]:
        """Run Louvain community detection.

        nodes: [{id, name, component_type}, ...]
        edges: [{source_id, target_id, relation}, ...]

        Returns: {node_id: community_label}
        """
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
