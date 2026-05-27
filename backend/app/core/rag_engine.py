import logging

log = logging.getLogger(__name__)
import asyncio
import uuid
import httpx
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchAny, MatchValue
from openai import AsyncOpenAI

from app.config import settings
from app.core.llm_providers import detect_provider, get_provider, PROVIDERS


def _build_httpx_client() -> httpx.AsyncClient:
    """Same hardened client as llm_service: long timeouts, no keepalive, trust env proxy."""
    timeout = httpx.Timeout(connect=30.0, read=120.0, write=30.0, pool=30.0)
    limits = httpx.Limits(max_connections=20, max_keepalive_connections=0)
    return httpx.AsyncClient(timeout=timeout, limits=limits, trust_env=True)
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
        self._embed_model: str = settings.effective_embed_model()
        self._embed_dim: int = settings.embedding_dim
        self.collection = settings.qdrant_collection
        # Optional provider hint set by configure_provider(); takes precedence
        # over base_url-based auto-detection in embed().
        self._provider_id: str | None = None

    def _get_embed_client(self) -> AsyncOpenAI:
        if self._embed_client:
            return self._embed_client
        return AsyncOpenAI(
            api_key=settings.effective_embed_api_key(),
            base_url=settings.effective_embed_base_url() or None,
            http_client=_build_httpx_client(),
        )

    def configure(self, api_key: str = "", base_url: str = "", model: str = "", dimensions: int = 0):
        if api_key and base_url:
            self._embed_client = AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
                http_client=_build_httpx_client(),
            )
        if model:
            self._embed_model = model
        if dimensions:
            self._embed_dim = dimensions

    def configure_provider(self, provider_id: str | None) -> None:
        """Pin the provider id, overriding base_url auto-detection in embed().

        Useful when a caller has the provider hint from the frontend and we
        want to avoid the substring-match heuristic in ``detect_provider()``.
        """
        self._provider_id = provider_id or None

    def _resolve_embed_provider(self):
        """Pick a ProviderPreset for the current embedding configuration.

        Priority: explicit ``configure_provider()`` hint → detect from the
        active ``AsyncOpenAI.base_url`` → detect from settings. Returns None
        if nothing matches; the caller falls back to the legacy
        "model name contains text-embedding-3" heuristic.
        """
        if self._provider_id:
            preset = get_provider(self._provider_id)
            if preset:
                return preset
        base_url = ""
        if self._embed_client is not None:
            client_base = getattr(self._embed_client, "base_url", "")
            base_url = str(client_base) if client_base else ""
        if not base_url:
            base_url = settings.effective_embed_base_url()
        return detect_provider(base_url)

    async def init_collection(self):
        try:
            cols = await self.qdrant.get_collections()
            names = [c.name for c in cols.collections]
            
            if self.collection in names:
                # Check existing collection dimensions
                info = await self.qdrant.get_collection(collection_name=self.collection)
                existing_size = info.config.params.vectors.size
                if existing_size != self._embed_dim:
                    log.warning("Dimension mismatch in Qdrant (Existing: %s, Config: %s). Re-creating collection.", existing_size, self._embed_dim)
                    await self.qdrant.delete_collection(collection_name=self.collection)
                    names.remove(self.collection)

            if self.collection not in names:
                await self.qdrant.create_collection(
                    collection_name=self.collection,
                    vectors_config=VectorParams(size=self._embed_dim, distance=Distance.COSINE),
                )
        except Exception as e:
            log.warning("Failed to connect to Qdrant or initialize collection: %s. RAG engine vector path will be disabled.", e)


    async def embed(self, texts: list[str], batch_size: int = 20) -> list[list[float]]:
        client = self._get_embed_client()
        all_embeddings = []

        # Guard against empty input
        if not texts:
            return []

        # Decide once per call whether to send `dimensions=`. The legacy
        # heuristic "send only when model contains text-embedding-3" silently
        # broke whenever a user configured Volcengine / SiliconFlow with a
        # custom dim — those providers 400 if they see `dimensions=`. The
        # provider registry is now the source of truth; we only fall back
        # to the OpenAI-v3 substring check when no preset matches.
        preset = self._resolve_embed_provider()
        if preset is not None:
            supports_dim = preset.embed_supports_dimensions
        else:
            supports_dim = "text-embedding-3" in self._embed_model

        effective_dim = self._embed_dim
        # DashScope text-embedding-v3 caps at 1024 — clamp so callers that set
        # the global embedding_dim to e.g. 1536 (OpenAI default) still work
        # when they switch the provider to DashScope without resetting the dim.
        if supports_dim and preset is not None and preset.id == "dashscope" and effective_dim > 1024:
            effective_dim = 1024

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            kwargs: dict = dict(model=self._embed_model, input=batch)
            if supports_dim and effective_dim:
                kwargs["dimensions"] = effective_dim

            # Simple retry logic for API flakiness
            for attempt in range(3):
                try:
                    response = await client.embeddings.create(**kwargs)
                    all_embeddings.extend([d.embedding for d in response.data])
                    break
                except Exception as e:
                    log.warning("Embedding attempt %d failed: %s", attempt+1, e)
                    if attempt == 2:
                        raise e
                    await asyncio.sleep(1 * (attempt + 1))

        return all_embeddings

    async def embed_multimodal(
        self,
        inputs: list[dict],
        model: str | None = None,
    ) -> list[list[float]]:
        """Embed text + images using DashScope native MultiModalEmbedding API.

        Each element in ``inputs`` is a dict with optional keys:
            - ``text``:  text content for the chunk
            - ``image``: image URL or base64 data URI (``data:image/...;base64,...``)

        Returns a list of embedding vectors (one per input element).
        """
        if not inputs:
            return []

        api_key = settings.effective_embed_api_key()
        if not api_key:
            raise ValueError("No embedding API key configured")

        mm_model = model or settings.multimodal_embed_model or "tongyi-embedding-vision-plus"

        try:
            from dashscope import MultiModalEmbedding
        except ImportError:
            raise ImportError(
                "dashscope SDK is required for multimodal embedding. "
                "Install it with: pip install dashscope"
            )

        all_embeddings: list[list[float]] = []

        # DashScope multimodal API accepts a list of {text, image} dicts
        # Retry logic for API flakiness
        for attempt in range(3):
            try:
                resp = await asyncio.to_thread(
                    MultiModalEmbedding.call,
                    api_key=api_key,
                    model=mm_model,
                    input=inputs,
                )
                # Check for errors
                if resp.status_code != 200:
                    raise RuntimeError(
                        f"DashScope multimodal embedding failed "
                        f"(status={resp.status_code}): {resp.message}"
                    )
                if resp.output is None or "embedding" not in resp.output:
                    raise RuntimeError(
                        f"DashScope multimodal embedding returned no embedding: "
                        f"{resp.output}"
                    )

                # resp.output["embedding"] is a single vector if input was a list
                # of multimodal elements (DashScope fuses text+image into one vector)
                emb = resp.output["embedding"]
                all_embeddings.append(emb)
                break
            except Exception as e:
                log.warning("Multimodal embedding attempt %d failed: %s", attempt+1, e)
                if attempt == 2:
                    raise e
                await asyncio.sleep(1 * (attempt + 1))

        return all_embeddings

    async def index_multimodal_chunks(
        self,
        chunks: list[dict],
        doc_id: str,
        metadata: dict,
    ):
        """Index chunks that may contain images using multimodal embedding.

        Each chunk is a dict with:
            - ``content``: text content (required)
            - ``image``: optional image URL or base64 data URI
        """
        if not chunks:
            return

        # Build multimodal inputs for DashScope
        mm_inputs = [
            {
                "text": c.get("content", ""),
                **({"image": c["image"]} if c.get("image") else {}),
            }
            for c in chunks
        ]

        # embed_multimodal currently returns one vector per call (fused).
        # For multiple chunks we call one-at-a-time to get per-chunk vectors.
        embeddings = []
        for inp in mm_inputs:
            vec_list = await self.embed_multimodal([inp])
            embeddings.extend(vec_list)

        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=emb,
                payload={
                    "doc_id": doc_id,
                    "content": c.get("content", ""),
                    "chunk_index": i,
                    "has_image": bool(c.get("image")),
                    **metadata,
                },
            )
            for i, (c, emb) in enumerate(zip(chunks, embeddings))
        ]

        qdrant_batch_size = 100
        for i in range(0, len(points), qdrant_batch_size):
            batch_points = points[i : i + qdrant_batch_size]
            await self.qdrant.upsert(
                collection_name=self.collection, points=batch_points
            )

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

    async def search(self, query: str, top_k: int = 5, category_filter: list[str] | None = None, manufacturer_filter: str | None = None, min_score: float = 0.35) -> list[dict]:
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
            score_threshold=min_score,
        )
        filtered = [r for r in results if r.score >= min_score]
        if len(filtered) < len(results):
            log.debug("RAG search: filtered %d low-score results (threshold=%.2f)", len(results) - len(filtered), min_score)
        return [
            {"id": r.id, "content": r.payload["content"], "score": r.score, "metadata": r.payload}
            for r in filtered
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

        # NOT_FOUND sentinel: only when graph HAS matching nodes but no exact
        # order number (real NOT_FOUND). Empty DB (no nodes at all) falls through
        # to LLM fallback — the zero-hallucination gate applies to graph misses,
        # not to missing data.
        if graph.status == "NOT_FOUND" and graph.components:
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
