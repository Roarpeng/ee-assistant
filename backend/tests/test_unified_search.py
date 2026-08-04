"""Unified search: RRF fusion + lexical channels (industrial-first).

Pure-function tests for ``rrf_merge`` / ``tokenize_query``, DB-backed
tests for the graph/project lexical channels (SQLite test DB), and an
endpoint test for ``POST /api/search`` with the Qdrant channels mocked.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.unified_search import (
    graph_lexical_search,
    project_text_search,
    rrf_merge,
    tokenize_query,
)
from app.db.models import ComponentNode, Organization, Project
from app.db.repository import async_session
from app.main import app


# 1. tokenize_query — MLFB splitting, CJK, dedupe, cap ─────────────────
def test_tokenize_query_handles_mlfb_cjk_and_dedupe():
    toks = tokenize_query("6ES7215-1AG40-0XB0 断路器")
    assert toks[:3] == ["6ES7215", "1AG40", "0XB0"]
    assert "断路器" in toks

    # single chars dropped, case-insensitive dedupe, cap respected
    assert tokenize_query("a AB ab ABC") == ["AB", "ABC"]
    assert len(tokenize_query(" ".join(f"tok{i}" for i in range(20)))) == 5
    assert tokenize_query("") == []
    assert tokenize_query("-") == []


# 2. rrf_merge — fusion, dedupe, determinism ───────────────────────────
def test_rrf_merge_promotes_items_present_in_both_lists():
    vector = ["a", "b", "c"]
    lexical = ["c", "d"]
    fused = rrf_merge([vector, lexical])
    # "c" appears in both → highest score; "a" beats "d" (1/61 > 1/62)
    assert fused[0] == "c"
    assert fused.index("a") < fused.index("d")
    assert sorted(fused) == ["a", "b", "c", "d"]

    # duplicates within one list must not double-count
    assert rrf_merge([["x", "x", "y"]]) == ["x", "y"]

    # deterministic tie-break: first-seen order
    assert rrf_merge([["p", "q"], []]) == rrf_merge([["p", "q"], []])
    assert rrf_merge([]) == []


# 3. graph_lexical_search — MLFB via properties, name hits, AND ───────
async def _seed_node(*, name: str, component_type: str, properties: dict) -> str:
    node_id = str(uuid.uuid4())
    async with async_session() as session:
        session.add(
            ComponentNode(
                id=node_id, name=name, component_type=component_type,
                properties=properties,
            )
        )
        await session.commit()
    return node_id


@pytest.mark.asyncio
async def test_graph_lexical_search_matches_mlfb_and_name():
    n_plc = await _seed_node(
        name="S7-1215C", component_type="PLC_CPU",
        properties={"manufacturer": "Siemens", "order_number": "6ES7215-1AG40-0XB0"},
    )
    await _seed_node(
        name="LC1D09", component_type="Contactor",
        properties={"manufacturer": "Schneider"},
    )

    async with async_session() as session:
        # MLFB fragment hits via properties JSON
        hits = await graph_lexical_search(session, "6ES7215")
        assert [h["id"] for h in hits] == [n_plc]
        assert hits[0]["order_number"] == "6ES7215-1AG40-0XB0"
        assert hits[0]["manufacturer"] == "Siemens"

        # name search (case-insensitive)
        hits2 = await graph_lexical_search(session, "lc1d09")
        assert len(hits2) == 1 and hits2[0]["name"] == "LC1D09"

        # multi-token AND: both tokens must match
        both = await graph_lexical_search(session, "Siemens PLC_CPU")
        assert [h["id"] for h in both] == [n_plc]

        # AND semantics reject partial matches
        none = await graph_lexical_search(session, "Siemens Contactor")
        assert none == []

        # component_type filter narrows
        filtered = await graph_lexical_search(session, "Siemens", component_type="Contactor")
        assert filtered == []

        # empty / junk query → []
        assert await graph_lexical_search(session, "") == []


# 4. project_text_search — name + title ────────────────────────────────
@pytest.mark.asyncio
async def test_project_text_search_matches_name_and_title():
    org_id = str(uuid.uuid4())
    async with async_session() as session:
        session.add(Organization(
            id=org_id, name="SearchOrg",
            code=f"searchorg-{uuid.uuid4().hex[:8]}", token_hash=uuid.uuid4().hex,
        ))
        session.add(Project(
            id=str(uuid.uuid4()), name="输送线输送线改造",
            title="Conveyor Retrofit", org_id=org_id,
        ))
        await session.commit()

    async with async_session() as session:
        by_title = await project_text_search(session, "Conveyor")
        assert len(by_title) == 1 and by_title[0]["title"] == "Conveyor Retrofit"

        by_name = await project_text_search(session, "输送线")
        assert len(by_name) == 1

        assert await project_text_search(session, "nonexistent-xyz") == []


# 5. POST /api/search — grouped output, RRF fusion, degradation ────────
@pytest.mark.asyncio
async def test_unified_search_endpoint_fuses_and_groups(monkeypatch):
    from app.core.rag_engine import rag_engine

    async def fake_vector_search(query, top_k=5, category_filter=None, manufacturer_filter=None, **kw):
        return [
            {"id": "chunk-1", "content": "S7-1215C manual excerpt", "score": 0.9, "metadata": {}},
            {"id": "chunk-2", "content": "general wiring guide", "score": 0.6, "metadata": {}},
        ]

    async def fake_lexical_search(query, top_k=5, category_filter=None, manufacturer_filter=None, **kw):
        # chunk-2 overlaps with vector list → RRF should boost it
        return [
            {"id": "chunk-2", "content": "general wiring guide", "score": 1.0,
             "metadata": {}, "source": "lexical", "lexical": True},
        ]

    monkeypatch.setattr(rag_engine, "search", fake_vector_search)
    monkeypatch.setattr(rag_engine, "lexical_search", fake_lexical_search)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/search", json={
            "query": "S7-1215C",
            "top_k": 5,
            "sources": ["knowledge"],
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["query"] == "S7-1215C"
    ids = [k["id"] for k in data["knowledge"]]
    # chunk-2 present in both channels → RRF rank #1; deduped (appears once)
    assert ids[0] == "chunk-2"
    assert ids.count("chunk-2") == 1
    assert data["knowledge"][0].get("lexical") is True
    # sources=["knowledge"] → other groups empty
    assert data["components"] == [] and data["projects"] == []


@pytest.mark.asyncio
async def test_unified_search_endpoint_degrades_when_channels_fail(monkeypatch):
    from app.core.rag_engine import rag_engine

    async def boom(*a, **kw):
        raise RuntimeError("qdrant down")

    monkeypatch.setattr(rag_engine, "search", boom)
    monkeypatch.setattr(rag_engine, "lexical_search", boom)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/search", json={"query": "S7-1215C"})
    # Reliability contract: request still 200, failing channels return []
    assert resp.status_code == 200
    data = resp.json()
    assert data["knowledge"] == []
