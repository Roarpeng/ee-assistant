import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock, AsyncMock
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
async def test_knowledge_semantic_search():
    mock_hits = [
        {
            "id": "pt-1",
            "content": "S7-1200 CPU specs",
            "score": 0.92,
            "metadata": {"doc_id": "d1", "filename": "cpu.pdf"},
        }
    ]
    with patch("app.api.knowledge.rag_engine.configure") as mock_cfg, \
         patch("app.api.knowledge.rag_engine.configure_provider") as mock_provider, \
         patch("app.api.knowledge.rag_engine.search", new_callable=AsyncMock, return_value=mock_hits) as mock_search:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                "/api/knowledge/search",
                json={
                    "query": "PLC CPU",
                    "top_k": 3,
                    "embedding_config": {
                        "api_key": "sk-test",
                        "base_url": "https://api.example.com/v1",
                        "model": "text-embedding-3-small",
                        "dimension": 1536,
                        "provider": "openai",
                    },
                },
            )
        assert response.status_code == 200
        assert response.json()["results"][0]["content"] == "S7-1200 CPU specs"
        assert mock_cfg.called
        assert mock_provider.called
        mock_search.assert_awaited_once()


@pytest.mark.asyncio
async def test_batch_delete_docs_empty():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.request("DELETE", "/api/knowledge/docs", content='{"ids": []}', headers={"Content-Type": "application/json"})
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_component_graph_crud_apis():
    from app.db.repository import async_session
    from app.db.models import Base
    from app.db.repository import engine

    # 确保数据库表已建好
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 1. 测试创建节点
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        node_data = {
            "name": "Schneider LC1D",
            "component_type": "Contactor",
            "properties": {"voltage": "AC 220V"}
        }
        res_node1 = await ac.post("/api/knowledge/graph/nodes", json=node_data)
        assert res_node1.status_code == 201
        n1 = res_node1.json()
        assert n1["name"] == "Schneider LC1D"
        assert n1["properties"]["voltage"] == "AC 220V"

        # 创建第二个节点
        node_data2 = {
            "name": "Schneider LRD",
            "component_type": "OverloadRelay",
            "properties": {"current_range": "9-13A"}
        }
        res_node2 = await ac.post("/api/knowledge/graph/nodes", json=node_data2)
        assert res_node2.status_code == 201
        n2 = res_node2.json()

        # 2. 测试获取节点列表与搜索
        res_list = await ac.get("/api/knowledge/graph/nodes?component_type=Contactor")
        assert res_list.status_code == 200
        nodes = res_list.json()
        assert len(nodes) >= 1
        assert nodes[0]["name"] == "Schneider LC1D"

        # 3. 测试创建关系边
        edge_data = {
            "source_id": n1["id"],
            "target_id": n2["id"],
            "relation": "COMPATIBLE_WITH",
            "properties": {"notes": "Direct mounting"}
        }
        res_edge = await ac.post("/api/knowledge/graph/edges", json=edge_data)
        assert res_edge.status_code == 201
        e = res_edge.json()
        assert e["source_id"] == n1["id"]
        assert e["relation"] == "COMPATIBLE_WITH"

        # 4. 测试获取边列表
        res_edges_list = await ac.get("/api/knowledge/graph/edges")
        assert res_edges_list.status_code == 200
        edges = res_edges_list.json()
        assert len(edges) >= 1
        assert edges[0]["id"] == e["id"]

        # 5. 测试删除关系边
        res_del_edge = await ac.delete(f"/api/knowledge/graph/edges/{e['id']}")
        assert res_del_edge.status_code == 204

        # 再次获取边，应该为空
        res_edges_list_after = await ac.get("/api/knowledge/graph/edges")
        assert len(res_edges_list_after.json()) == 0

        # 重新创建边用于级联删除测试
        res_edge_re = await ac.post("/api/knowledge/graph/edges", json=edge_data)
        assert res_edge_re.status_code == 201
        e_re = res_edge_re.json()

        # 6. 测试删除节点
        res_del_node = await ac.delete(f"/api/knowledge/graph/nodes/{n1['id']}")
        assert res_del_node.status_code == 204

        # 验证节点1已被删除
        res_list_after = await ac.get(f"/api/knowledge/graph/nodes")
        assert not any(n["id"] == n1["id"] for n in res_list_after.json())

        # 验证相关的边也被级联删除（即 edge_re 也不存在了）
        res_edges_final = await ac.get("/api/knowledge/graph/edges")
        assert not any(ed["id"] == e_re["id"] for ed in res_edges_final.json())
