import json as json_module
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.repository import get_session
from app.db.models import KnowledgeDoc
from app.core.schemas import KnowledgeDocOut, KnowledgeSearch
from app.core.rag_engine import rag_engine
from app.core.entity_extractor import entity_extractor
from app.core.knowledge_graph import ComponentGraph
from app.core.community_detector import CommunityDetector

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.post("/docs", response_model=KnowledgeDocOut)
async def upload_doc(
    manufacturer: str = Form(...),
    category_tags: str = Form("[]"),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    tags = json_module.loads(category_tags)
    content = await file.read()
    text = extract_pdf_text(content)

    doc = KnowledgeDoc(
        filename=file.filename or "unknown.pdf",
        manufacturer=manufacturer,
        category_tags=tags,
        chunk_count=0,
    )
    session.add(doc)
    await session.commit()

    chunks = chunk_text(text, doc.id, manufacturer, tags)
    doc.chunk_count = len(chunks)
    await session.commit()

    await rag_engine.index_chunks(chunks, doc.id, {"manufacturer": manufacturer, "category_tags": tags})

    # Launch graph extraction as background task (non-blocking)
    import asyncio
    asyncio.create_task(_extract_graph_knowledge(text, doc.id, session))

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
    await rag_engine.delete_doc_chunks(doc_id)
    await session.delete(doc)
    await session.commit()


@router.post("/search")
async def search(body: KnowledgeSearch):
    results = await rag_engine.search(
        query=body.query,
        top_k=body.top_k,
        category_filter=body.category_filter,
        manufacturer_filter=body.manufacturer_filter,
    )
    return {"results": results}


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
        pass  # Graph extraction failure must not break the upload flow


def extract_pdf_text(content: bytes) -> str:
    import fitz
    doc = fitz.open(stream=content, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    return text


def chunk_text(text: str, doc_id: str, manufacturer: str, tags: list[str]) -> list[dict]:
    chunks = []
    paragraphs = text.split("\n\n")
    current = ""
    for para in paragraphs:
        if len(current) + len(para) < 500:
            current += para + "\n\n"
        else:
            if current.strip():
                chunks.append({"content": current.strip(), "doc_id": doc_id, "manufacturer": manufacturer, "category_tags": tags})
            current = para + "\n\n"
    if current.strip():
        chunks.append({"content": current.strip(), "doc_id": doc_id, "manufacturer": manufacturer, "category_tags": tags})
    return chunks
