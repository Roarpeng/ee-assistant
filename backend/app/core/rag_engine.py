import uuid
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchAny, MatchValue
from openai import AsyncOpenAI

from app.config import settings


class RAGEngine:
    def __init__(self):
        self.qdrant = AsyncQdrantClient(url=settings.qdrant_url)
        self.openai = AsyncOpenAI(api_key=settings.openai_api_key)
        self.collection = settings.qdrant_collection

    async def init_collection(self):
        cols = await self.qdrant.get_collections()
        names = [c.name for c in cols.collections]
        if self.collection not in names:
            await self.qdrant.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(size=settings.embedding_dim, distance=Distance.COSINE),
            )

    async def embed(self, texts: list[str]) -> list[list[float]]:
        response = await self.openai.embeddings.create(model=settings.embedding_model, input=texts)
        return [d.embedding for d in response.data]

    async def index_chunks(self, chunks: list[dict], doc_id: str, metadata: dict):
        texts = [c["content"] for c in chunks]
        embeddings = await self.embed(texts)
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
        await self.qdrant.upsert(collection_name=self.collection, points=points)

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


rag_engine = RAGEngine()
