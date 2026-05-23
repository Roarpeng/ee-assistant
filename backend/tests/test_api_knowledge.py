import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock
from app.main import app
from app.db.models import KnowledgeDoc
from sqlalchemy import select

@pytest.mark.asyncio
async def test_list_knowledge_docs_empty():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/knowledge/docs")
    assert response.status_code == 200
    assert response.json() == []

@pytest.mark.asyncio
async def test_upload_knowledge_doc():
    # Mock storage and processing to avoid real IO
    with patch("app.api.knowledge._store_in_minio"), \
         patch("app.api.knowledge._process_document") as mock_process:
        mock_process.return_value = None # This is a coroutine mock
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            files = {"file": ("test.pdf", b"fake-content", "application/pdf")}
            data = {"manufacturer": "Siemens", "category_tags": '["PLC"]'}
            response = await ac.post("/api/knowledge/docs", data=data, files=files)
            
        assert response.status_code == 201
        res_data = response.json()
        assert res_data["filename"] == "test.pdf"
        assert res_data["manufacturer"] == "Siemens"
        assert res_data["status"] == "uploading"
        assert mock_process.called

@pytest.mark.asyncio
async def test_delete_knowledge_doc():
    # Create a doc first
    from app.db.repository import async_session
    async with async_session() as session:
        doc = KnowledgeDoc(id="test-id", filename="test.pdf", manufacturer="Siemens", status="ready")
        session.add(doc)
        await session.commit()

    with patch("app.api.knowledge.rag_engine.delete_doc_chunks") as mock_delete:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.delete("/api/knowledge/docs/test-id")
        
        assert response.status_code == 204
        assert mock_delete.called

    # Verify deleted from DB
    async with async_session() as session:
        result = await session.execute(select(KnowledgeDoc).where(KnowledgeDoc.id == "test-id"))
        assert result.scalar() is None

@pytest.mark.asyncio
async def test_batch_delete_docs():
    from app.db.repository import async_session
    async with async_session() as session:
        # Clear first to be sure
        from app.db.models import Base
        from app.db.repository import engine
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        doc1 = KnowledgeDoc(id="id1", filename="1.pdf", manufacturer="S1", status="ready")
        doc2 = KnowledgeDoc(id="id2", filename="2.pdf", manufacturer="S2", status="ready")
        session.add_all([doc1, doc2])
        await session.commit()

    with patch("app.api.knowledge.rag_engine.delete_doc_chunks") as mock_delete:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.request("DELETE", "/api/knowledge/docs", content='{"ids": ["id1", "id2"]}', headers={"Content-Type": "application/json"})
        
        assert response.status_code == 200
        assert response.json()["deleted"] == 2
        assert mock_delete.call_count == 2

    async with async_session() as session:
        result = await session.execute(select(KnowledgeDoc))
        assert len(result.scalars().all()) == 0

@pytest.mark.asyncio
async def test_delete_doc_keeps_graph_nodes():
    from app.db.repository import async_session
    from app.db.models import ComponentNode
    async with async_session() as session:
        doc = KnowledgeDoc(id="doc-to-delete", filename="test.pdf", manufacturer="S", status="ready")
        node = ComponentNode(id="node-id", name="Relay", component_type="Relay", source_doc_id="doc-to-delete")
        session.add_all([doc, node])
        await session.commit()

    with patch("app.api.knowledge.rag_engine.delete_doc_chunks") as mock_delete:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.delete("/api/knowledge/docs/doc-to-delete")
        assert response.status_code == 204
        assert mock_delete.called


    async with async_session() as session:
        result = await session.execute(select(ComponentNode).where(ComponentNode.id == "node-id"))
        node_after = result.scalar()
        assert node_after is not None
        assert node_after.source_doc_id is None

@pytest.mark.asyncio
async def test_batch_delete_docs_empty():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.request("DELETE", "/api/knowledge/docs", content='{"ids": []}', headers={"Content-Type": "application/json"})
    assert response.status_code == 400
