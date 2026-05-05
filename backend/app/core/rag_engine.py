import asyncio
import uuid
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchAny, MatchValue
from openai import AsyncOpenAI

from app.config import settings
from app.core.graph_rag import (
    GraphRetriever,
    GraphRetrievalRequest,
    GraphRetrievalResult,
    HybridSearchResult,
    VectorRetriever,
)


class RAGEngine:
    def __init__(self):
        self.qdrant = AsyncQdrantClient(url=settings.qdrant_url)
        self._embed_client: AsyncOpenAI | None = None
        self._embed_model: str = settings.embed_model
        self._embed_dim: int = settings.embedding_dim
        self.collection = settings.qdrant_collection

    def _get_embed_client(self) -> AsyncOpenAI:
        if self._embed_client:
            return self._embed_client
        return AsyncOpenAI(
            api_key=settings.embed_api_key,
            base_url=settings.embed_base_url if settings.embed_api_key else None,
        )

    def configure(self, api_key: str = "", base_url: str = "", model: str = "", dimensions: int = 0):
        if api_key and base_url:
            self._embed_client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        if model:
            self._embed_model = model
        if dimensions:
            self._embed_dim = dimensions

    async def init_collection(self):
        cols = await self.qdrant.get_collections()
        names = [c.name for c in cols.collections]
        
        if self.collection in names:
            # Check existing collection dimensions
            info = await self.qdrant.get_collection(collection_name=self.collection)
            existing_size = info.config.params.vectors.size
            if existing_size != self._embed_dim:
                print(f"Dimension mismatch in Qdrant (Existing: {existing_size}, Config: {self._embed_dim}). Re-creating collection.")
                await self.qdrant.delete_collection(collection_name=self.collection)
                names.remove(self.collection)

        if self.collection not in names:
            await self.qdrant.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(size=self._embed_dim, distance=Distance.COSINE),
            )

    async def embed(self, texts: list[str], batch_size: int = 20) -> list[list[float]]:
        client = self._get_embed_client()
        all_embeddings = []
        
        # Guard against empty input
        if not texts:
            return []
            
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            # Some providers (e.g. SiliconFlow, local models) don't support 'dimensions'
            # Only send it for OpenAI's v3 models if configured
            kwargs: dict = dict(model=self._embed_model, input=batch)
            if self._embed_dim and "text-embedding-3" in self._embed_model:
                kwargs["dimensions"] = self._embed_dim
            
            # Simple retry logic for API flakiness
            for attempt in range(3):
                try:
                    response = await client.embeddings.create(**kwargs)
                    all_embeddings.extend([d.embedding for d in response.data])
                    break
                except Exception as e:
                    print(f"Embedding attempt {attempt+1} failed: {e}")
                    if attempt == 2:
                        raise e
                    await asyncio.sleep(1 * (attempt + 1))
                    
        return all_embeddings

    async def index_chunks(self, chunks: list[dict], doc_id: str, metadata: dict):
        if not chunks:
            return
            
        texts = [c["content"] for c in chunks]
        # Batch size for embedding API (OpenAI/SiliconFlow usually allow 100+, but smaller is safer)
        embeddings = await self.embed(texts, batch_size=20)
        
        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=emb,
                payload={
                    "doc_id": doc_id,
                    "content": c["content"],
                    "chunk_index": i,
                    **metadata,
                },
            )
            for i, (c, emb) in enumerate(zip(chunks, embeddings))
        ]
        
        # Upsert to Qdrant in batches to avoid large request body
        qdrant_batch_size = 100
        for i in range(0, len(points), qdrant_batch_size):
            batch_points = points[i : i + qdrant_batch_size]
            await self.qdrant.upsert(collection_name=self.collection, points=batch_points)

    async def search(self, query: str, top_k: int = 5, category_filter: list[str] | None = None, manufacturer_filter: str | None = None) -> list[dict]:
        query_vec = (await self.embed([query]))[0]
        qdrant_filter = None
        must_conditions = []
        if category_filter:
            must_conditions.append(FieldCondition(key="category_tags", match=MatchAny(any=category_filter)))
        if manufacturer_filter:
            must_conditions.append(FieldCondition(key="manufacturer", match=MatchAny(any=[manufacturer_filter])))
        if must_conditions:
            qdrant_filter = Filter(must=must_conditions)

        results = await self.qdrant.search(
            collection_name=self.collection,
            query_vector=query_vec,
            limit=top_k,
            query_filter=qdrant_filter,
        )
        return [
            {"id": r.id, "content": r.payload["content"], "score": r.score, "metadata": r.payload}
            for r in results
        ]

    async def delete_doc_chunks(self, doc_id: str):
        await self.qdrant.delete(
            collection_name=self.collection,
            points_selector=Filter(must=[FieldCondition(key="doc_id", match=MatchValue(value=doc_id))]),
        )

    async def hybrid_search(
        self,
        query: str,
        component_type: str,
        top_k: int,
        session,
        machine_type: str = "",
        safety_level: str = "",
        plc_family: str = "S7-1200",
    ) -> HybridSearchResult:
        """Dual-path retrieval with strict separation:

        Path 1 (Vector / soft):  Qdrant — supplementary docs only.
        Path 2 (Graph  / hard):  PostgreSQL graph — exact part numbers + accessories.

        The graph path is authoritative for BOM selection. The vector path
        provides contextual documentation only and must NOT influence part numbers.
        """
        # ── Path 1: Vector (soft) — documentation search ──
        vec_retriever = VectorRetriever(self)
        vector_results = await vec_retriever.search_manuals(query, top_k=top_k * 2)
        for r in vector_results:
            r["source"] = "vector"
            r["authoritative"] = False  # vector results are NEVER authoritative for part numbers

        # ── Path 2: Graph (hard) — exact part number retrieval ──
        graph_retriever = GraphRetriever(session)
        graph_request = GraphRetrievalRequest(
            category=component_type,
            machine_type=machine_type,
            safety_level=safety_level,
            plc_family=plc_family,
        )
        graph_result = await graph_retriever.retrieve(graph_request)

        requires_human = (
            graph_result.human_intervention_required
            or graph_result.status in ("NOT_FOUND", "PARTIAL")
        )

        return HybridSearchResult(
            graph_result=graph_result,
            vector_results=vector_results,
            requires_human_review=requires_human,
        )

    async def search_with_graph(
        self, query: str, component_type: str, top_k: int, session
    ) -> list[dict]:
        """Backward-compatible wrapper: converts HybridSearchResult to legacy list format.

        Used by fanout_selection_supervisor agent node. New code should use
        hybrid_search() directly for structured GraphRetrievalResult access.
        """
        result = await self.hybrid_search(
            query=query,
            component_type=component_type,
            top_k=top_k,
            session=session,
        )

        graph = result.graph_result
        output: list[dict] = []

        # Graph results (authoritative — carry exact order numbers)
        for comp in graph.components:
            output.append({
                "id": comp.id,
                "content": f"{comp.name} ({comp.component_type}) — MLFB: {comp.order_number or 'N/A'}",
                "score": 1.0,
                "metadata": {
                    "name": comp.name,
                    "component_type": comp.component_type,
                    "manufacturer": comp.manufacturer,
                    "order_number": comp.order_number,
                    **comp.properties,
                },
                "source": "graph",
                "authoritative": True,
            })

        # Vector results (supplementary — tagged non-authoritative)
        for vr in result.vector_results:
            if len(output) >= top_k + 5:
                break
            vr["authoritative"] = False
            output.append(vr)

        # If graph returned NOT_FOUND, prepend a sentinel entry
        if graph.status == "NOT_FOUND" and not graph.components:
            output.insert(0, {
                "id": f"NOT_FOUND_{component_type}",
                "content": f"STATUS: NOT_FOUND — {graph.message}",
                "score": 0.0,
                "metadata": {
                    "status": "NOT_FOUND",
                    "human_intervention_required": True,
                    "message": graph.message,
                },
                "source": "graph",
                "authoritative": True,
            })

        return output


rag_engine = RAGEngine()
