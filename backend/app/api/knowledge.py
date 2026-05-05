import asyncio
import io
import json as json_module
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, WebSocket
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.schemas import BatchDeleteInput, KnowledgeDocOut, KnowledgeRetryInput, KnowledgeSearch, ProgressEvent
from app.db.models import KnowledgeDoc
from app.db.repository import get_session
from app.core.rag_engine import rag_engine
from app.core.entity_extractor import entity_extractor
from app.core.knowledge_graph import ComponentGraph
from app.core.community_detector import CommunityDetector

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

    doc = KnowledgeDoc(
        filename=file.filename or "unknown.pdf",
        manufacturer=manufacturer,
        category_tags=tags,
        chunk_count=0,
        status="uploading",
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)

    content = await file.read()
    _store_in_minio(doc.id, content, file.filename)
    asyncio.create_task(_process_document(content, doc.id, manufacturer, tags, llm_cfg, embed_cfg))

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

    asyncio.create_task(_process_document(content, doc.id, doc.manufacturer, doc.category_tags,
                                          body.llm_config, body.embedding_config))

    return doc


@router.post("/search")
async def search(body: KnowledgeSearch):
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


async def _process_document(content: bytes, doc_id: str, manufacturer: str, tags: list[str],
                            llm_config: dict | None = None, embedding_config: dict | None = None):
    """Background task: extract text → chunk → embed → graph extract with phase updates."""
    from app.db.repository import engine
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.core.llm_service import llm_service
    import traceback

    # Apply frontend-provided config at the start so all subsequent calls use it
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
                stage="chunking", message="正在提取 PDF 文本并分块..."
            ))

            # Run synchronous PDF extraction in a thread pool to avoid blocking
            loop = asyncio.get_running_loop()
            text = await loop.run_in_executor(None, extract_pdf_text, content)

            if not text.strip():
                raise ValueError("PDF 文本提取为空，可能是扫描件（暂不支持 OCR）或加密文档。")

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

            await _update_status(session, doc_id, "graph_extracting")
            await knowledge_progress.push(doc_id, ProgressEvent(
                stage="graph_extracting", message="正在提取实体与关系图谱..."
            ))

            await _extract_graph_knowledge(text[:20000], doc_id, session)

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
    """Extract component entities and relationships from PDF text into the knowledge graph."""
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


def extract_pdf_text(content: bytes) -> str:
    import fitz
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        text = ""
        # Limit to first 200 pages for 20MB+ documents to avoid OOM
        max_pages = 200
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            text += page.get_text()
        doc.close()
        return text
    except Exception as e:
        print(f"PyMuPDF error: {e}")
        return ""


def _store_in_minio(doc_id: str, content: bytes, filename: str):
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


def chunk_text(text: str, doc_id: str, manufacturer: str, tags: list[str]) -> list[dict]:
    chunks = []
    # Larger chunk size (1500 chars) to reduce total request count for large PDFs
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
