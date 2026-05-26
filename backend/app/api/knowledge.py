import asyncio
import io
import json as json_module
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, WebSocket
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.schemas import (
    BatchDeleteInput,
    KnowledgeDocOut,
    KnowledgeRetryInput,
    KnowledgeSearch,
    KnowledgeURLIngest,
    ProgressEvent,
)
from app.db.models import KnowledgeDoc
from app.db.repository import get_session
from app.core.rag_engine import rag_engine
from app.core.entity_extractor import entity_extractor
from app.core.knowledge_graph import ComponentGraph
from app.core.community_detector import CommunityDetector
from app.core.extractors import (
    ExtractionError,
    SUPPORTED_SUFFIXES,
    UnsupportedSourceError,
    detect_source_type,
    extract_pdf_page_images,
    extract_text,
    normalize_suffix,
)
from app.core.url_fetcher import URLFetchError, fetch_url

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class KnowledgeProgressManager:
    """Manages WebSocket connections for knowledge document processing progress."""

    def __init__(self):
        self._ws: dict[str, WebSocket] = {}

    def register(self, doc_id: str, ws: WebSocket):
        self._ws[doc_id] = ws

    def unregister(self, doc_id: str):
        self._ws.pop(doc_id, None)

    async def push(self, doc_id: str, event: ProgressEvent):
        ws = self._ws.get(doc_id)
        if ws:
            try:
                await ws.send_text(event.model_dump_json())
            except Exception:
                self.unregister(doc_id)


knowledge_progress = KnowledgeProgressManager()


@router.post("/docs", response_model=KnowledgeDocOut, status_code=201)
async def upload_doc(
    manufacturer: str = Form(...),
    category_tags: str = Form("[]"),
    file: UploadFile = File(...),
    llm_config: str = Form("{}"),
    embedding_config: str = Form("{}"),
    session: AsyncSession = Depends(get_session),
):
    tags = json_module.loads(category_tags)
    llm_cfg = json_module.loads(llm_config) or None
    embed_cfg = json_module.loads(embedding_config) or None

    # Reject early with a 415 if the suffix isn't on our whitelist —
    # better than queueing a doomed background task and surfacing the
    # error 30 seconds later via WebSocket.
    filename = file.filename or "unknown"
    try:
        source_type = detect_source_type(filename, file.content_type)
    except UnsupportedSourceError as exc:
        raise HTTPException(status_code=415, detail=str(exc))

    doc = KnowledgeDoc(
        filename=filename,
        manufacturer=manufacturer,
        category_tags=tags,
        chunk_count=0,
        status="uploading",
        source_type=source_type,
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)

    content = await file.read()
    _store_in_minio(doc.id, content, filename)
    asyncio.create_task(_process_document(content, doc.id, filename, manufacturer, tags, llm_cfg, embed_cfg))

    return doc


@router.post("/urls", response_model=KnowledgeDocOut, status_code=201)
async def ingest_url(
    body: KnowledgeURLIngest,
    session: AsyncSession = Depends(get_session),
):
    """Single-URL ingestion. Fetches the page, dispatches by Content-Type
    to the same extractor pipeline as file uploads. Background processing
    is identical to /docs from this point on.
    """
    try:
        content, mime, derived_name = await fetch_url(body.url)
    except URLFetchError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # The URL endpoint always tags source_type='url' regardless of the
    # underlying parsed format — that lets the UI badge "URL" distinctly.
    # The actual parser is still picked from the derived filename suffix
    # so the extractor dispatch stays uniform.
    try:
        # Validate that we *can* parse what we just fetched before we
        # commit a DB row + MinIO blob.
        detect_source_type(derived_name, mime)
    except UnsupportedSourceError as exc:
        raise HTTPException(
            status_code=415,
            detail=f"URL returned unsupported content: {exc}",
        )

    doc = KnowledgeDoc(
        filename=derived_name,
        manufacturer=body.manufacturer,
        category_tags=body.category_tags,
        chunk_count=0,
        status="uploading",
        source_type="url",
        source_url=body.url,
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)

    _store_in_minio(doc.id, content, derived_name)
    asyncio.create_task(
        _process_document(
            content,
            doc.id,
            derived_name,
            body.manufacturer,
            body.category_tags,
            body.llm_config,
            body.embedding_config,
        )
    )

    return doc


@router.get("/docs", response_model=list[KnowledgeDocOut])
async def list_docs(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(KnowledgeDoc).order_by(KnowledgeDoc.uploaded_at.desc()))
    return result.scalars().all()


@router.delete("/docs/{doc_id}", status_code=204)
async def delete_doc(doc_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(KnowledgeDoc).where(KnowledgeDoc.id == doc_id))
    doc = result.scalar()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await _delete_single_doc(doc_id, session)


@router.delete("/docs")
async def batch_delete_docs(body: BatchDeleteInput, session: AsyncSession = Depends(get_session)):
    if not body.ids:
        raise HTTPException(status_code=400, detail="ids must not be empty")
    deleted = 0
    for doc_id in body.ids:
        result = await session.execute(select(KnowledgeDoc).where(KnowledgeDoc.id == doc_id))
        if result.scalar() is None:
            continue
        try:
            await _delete_single_doc(doc_id, session)
            deleted += 1
        except Exception:
            pass
    if deleted == 0:
        raise HTTPException(status_code=500, detail="Failed to delete all specified documents")
    return {"deleted": deleted}


@router.post("/docs/{doc_id}/retry", response_model=KnowledgeDocOut)
async def retry_doc(doc_id: str, body: KnowledgeRetryInput, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(KnowledgeDoc).where(KnowledgeDoc.id == doc_id))
    doc = result.scalar()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status not in ("error", "ready"):
        raise HTTPException(status_code=400, detail=f"Cannot retry document in status '{doc.status}'")

    content = _fetch_from_minio(doc_id)
    if not content:
        raise HTTPException(status_code=400, detail="Original file not found in storage. Please re-upload.")

    if body.llm_config or body.embedding_config:
        from app.core.llm_service import llm_service
        llm_service.configure(chat_config=body.llm_config, embed_config=body.embedding_config)
    if body.embedding_config:
        rag_engine.configure(
            api_key=body.embedding_config.get("api_key", ""),
            base_url=body.embedding_config.get("base_url", ""),
            model=body.embedding_config.get("model", ""),
            dimensions=body.embedding_config.get("dimension", 0),
        )

    doc.status = "uploading"
    await session.commit()
    await session.refresh(doc)

    asyncio.create_task(_process_document(content, doc.id, doc.filename, doc.manufacturer, doc.category_tags,
                                          body.llm_config, body.embedding_config))

    return doc


@router.post("/search")
async def search(body: KnowledgeSearch):
    if body.embedding_config:
        rag_engine.configure(
            api_key=body.embedding_config.get("api_key", ""),
            base_url=body.embedding_config.get("base_url", ""),
            model=body.embedding_config.get("model", ""),
            dimensions=body.embedding_config.get("dimension", 0) or body.embedding_config.get("dimensions", 0),
        )
        provider = body.embedding_config.get("provider")
        if provider:
            rag_engine.configure_provider(provider)
    results = await rag_engine.search(
        query=body.query,
        top_k=body.top_k,
        category_filter=body.category_filter,
        manufacturer_filter=body.manufacturer_filter,
    )
    return {"results": results}


async def _delete_single_doc(doc_id: str, session: AsyncSession):
    await rag_engine.delete_doc_chunks(doc_id)
    result = await session.execute(
        select(KnowledgeDoc).where(KnowledgeDoc.id == doc_id)
    )
    doc = result.scalar()
    if doc:
        await session.delete(doc)
    await session.commit()


async def _process_document(content: bytes, doc_id: str, filename: str, manufacturer: str, tags: list[str],
                            llm_config: dict | None = None, embedding_config: dict | None = None):
    """Background task: extract text → chunk → embed → graph extract with phase updates."""
    from app.db.repository import engine
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.core.llm_service import llm_service
    import traceback

    if llm_config or embedding_config:
        llm_service.configure(chat_config=llm_config, embed_config=embedding_config)
    if embedding_config:
        rag_engine.configure(
            api_key=embedding_config.get("api_key", ""),
            base_url=embedding_config.get("base_url", ""),
            model=embedding_config.get("model", ""),
            dimensions=embedding_config.get("dimension", 0),
        )

    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        try:
            await _update_status(session, doc_id, "chunking")
            await knowledge_progress.push(doc_id, ProgressEvent(
                stage="chunking", message=f"正在提取文本并分块（{normalize_suffix(filename) or '未知格式'}）..."
            ))

            # Extractor dispatch is sync + CPU-bound; keep it off the
            # event loop so concurrent uploads stay snappy.
            loop = asyncio.get_running_loop()
            text = ""
            multimodal_chunks: list[dict] | None = None
            try:
                text = await loop.run_in_executor(
                    None,
                    lambda: extract_text(content, filename=filename),
                )
            except UnsupportedSourceError as exc:
                raise ValueError(f"暂不支持的文档类型: {exc}") from exc
            except ExtractionError:
                # Image-only PDF fallback: extract page images for multimodal embedding
                suffix = normalize_suffix(filename)
                if suffix == ".pdf":
                    await knowledge_progress.push(doc_id, ProgressEvent(
                        stage="chunking",
                        message="扫描型 PDF 检测到，切换到多模态嵌入模式..."
                    ))
                    page_images = await loop.run_in_executor(
                        None,
                        lambda: extract_pdf_page_images(content),
                    )
                    if not page_images:
                        raise ValueError("PDF 无法提取页面图像，可能损坏或加密。")
                    multimodal_chunks = [
                        {
                            "content": p["text"] or f"Page {p['page']+1}",
                            "image": p["image_base64"],
                            "doc_id": doc_id,
                            "manufacturer": manufacturer,
                            "category_tags": tags,
                        }
                        for p in page_images
                    ]
                else:
                    raise ValueError(
                        "提取的文本为空。文档可能为纯图像(扫描版/需 OCR)、已加密或格式损坏。"
                    )

            if multimodal_chunks:
                # Multimodal embedding path
                await _update_status(session, doc_id, "embedding")
                await knowledge_progress.push(doc_id, ProgressEvent(
                    stage="embedding",
                    message=f"正在多模态向量化 {len(multimodal_chunks)} 个页面..."
                ))

                await rag_engine.index_multimodal_chunks(
                    multimodal_chunks, doc_id,
                    {"manufacturer": manufacturer, "category_tags": tags},
                )
                await session.execute(
                    update(KnowledgeDoc)
                    .where(KnowledgeDoc.id == doc_id)
                    .values(chunk_count=len(multimodal_chunks))
                )
                await session.commit()
            else:
                # Standard text embedding path
                chunks = chunk_text(text, doc_id, manufacturer, tags)
                if not chunks:
                    raise ValueError("文档内容过短，无法生成有效的文本块。")

                await _update_status(session, doc_id, "embedding")
                await knowledge_progress.push(doc_id, ProgressEvent(
                    stage="embedding", message=f"正在向量化 {len(chunks)} 个文本块..."
                ))

                await rag_engine.index_chunks(chunks, doc_id, {"manufacturer": manufacturer, "category_tags": tags})
                await session.execute(
                    update(KnowledgeDoc).where(KnowledgeDoc.id == doc_id).values(chunk_count=len(chunks))
                )
                await session.commit()

            # Graph extraction: use concatenated page texts for multimodal PDFs
            graph_text = text
            if not graph_text and multimodal_chunks:
                graph_text = "\n".join(c["content"] for c in multimodal_chunks if c["content"])

            if graph_text.strip():
                await _update_status(session, doc_id, "graph_extracting")
                await knowledge_progress.push(doc_id, ProgressEvent(
                    stage="graph_extracting", message="正在提取实体与关系图谱..."
                ))

                await _extract_graph_knowledge(graph_text[:20000], doc_id, session)

            await _update_status(session, doc_id, "ready")
            await knowledge_progress.push(doc_id, ProgressEvent(
                stage="ready", message="文档处理完成"
            ))
        except Exception as e:
            error_detail = f"{str(e)}\n{traceback.format_exc()}"
            print(f"Error processing doc {doc_id}: {error_detail}")
            await _update_status(session, doc_id, "error")
            await knowledge_progress.push(doc_id, ProgressEvent(
                stage="error", message=f"处理失败: {str(e)}"
            ))


async def _update_status(session: AsyncSession, doc_id: str, status: str):
    await session.execute(
        update(KnowledgeDoc).where(KnowledgeDoc.id == doc_id).values(status=status)
    )
    await session.commit()


async def _extract_graph_knowledge(text: str, doc_id: str, session: AsyncSession):
    """Extract component entities and relationships from text into the knowledge graph."""
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
                await graph.add_edge(
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
        pass


def _store_in_minio(doc_id: str, content: bytes, filename: str):
    """Persist raw bytes for retry. Path prefix `pdfs/` is historical —
    we keep it for backward compatibility with backup/restore scripts.
    Actual file types under this prefix may be PDF, TXT, HTML, DOCX, etc.
    See docs/superpowers/specs/2026-05-09-knowledge-multi-source-design.md
    """
    try:
        from minio import Minio
        from app.config import settings
        client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=False,
        )
        bucket = settings.minio_bucket
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
        client.put_object(bucket, f"pdfs/{doc_id}/{filename}", io.BytesIO(content), len(content))
    except Exception:
        pass


def _fetch_from_minio(doc_id: str) -> bytes | None:
    try:
        from minio import Minio
        from app.config import settings
        client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=False,
        )
        bucket = settings.minio_bucket
        objects = list(client.list_objects(bucket, prefix=f"pdfs/{doc_id}/"))
        if not objects:
            return None
        resp = client.get_object(bucket, objects[0].object_name)
        return resp.read()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Legacy alias kept for any external import. The single source of truth for
# extraction now lives in app.core.extractors.extract_text().
# ---------------------------------------------------------------------------


def extract_pdf_text(content: bytes) -> str:
    return extract_text(content, filename="legacy.pdf")


def chunk_text(text: str, doc_id: str, manufacturer: str, tags: list[str]) -> list[dict]:
    chunks = []
    chunk_size = 1500
    paragraphs = text.split("\n\n")
    current = ""
    for para in paragraphs:
        if len(current) + len(para) < chunk_size:
            current += para + "\n\n"
        else:
            if current.strip():
                chunks.append({
                    "content": current.strip(),
                    "doc_id": doc_id,
                    "manufacturer": manufacturer,
                    "category_tags": tags
                })
            current = para + "\n\n"

            # If a single paragraph is larger than chunk_size, split it forcefully
            if len(current) > chunk_size:
                while len(current) > chunk_size:
                    chunks.append({
                        "content": current[:chunk_size].strip(),
                        "doc_id": doc_id,
                        "manufacturer": manufacturer,
                        "category_tags": tags
                    })
                    current = current[chunk_size:]

    if current.strip():
        chunks.append({
            "content": current.strip(),
            "doc_id": doc_id,
            "manufacturer": manufacturer,
            "category_tags": tags
        })
    return chunks
