"""Unified search API — one query across three sources.

``POST /api/search`` fans out to:

* **knowledge**  — vector (Qdrant semantic) + lexical (Qdrant full-text)
  channels fused with RRF. The lexical channel exists because MLFBs /
  order numbers (``6ES7215-1AG40-0XB0``) are exactly where embedding
  recall is weakest.
* **components** — keyword search over the component knowledge graph
  (name / type / properties incl. order_number).
* **projects**   — keyword search over project name / title.

Reliability contract: every channel is best-effort — a failing channel
logs and returns empty instead of failing the whole request. This
endpoint serves *human lookup* only; BOM selection keeps its strict
graph-authoritative hard separation (see ``hybrid_search``).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rag_engine import rag_engine
from app.core.unified_search import graph_lexical_search, project_text_search, rrf_merge
from app.db.repository import get_session

log = logging.getLogger(__name__)

router = APIRouter(tags=["search"])

ALLOWED_SOURCES = {"knowledge", "components", "projects"}


class UnifiedSearchIn(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    top_k: int = Field(default=10, ge=1, le=50)
    # None = all sources; otherwise a subset of knowledge|components|projects
    sources: list[str] | None = None
    # knowledge-channel filters (mirrors /api/knowledge/search)
    category_filter: list[str] | None = None
    manufacturer_filter: str | None = None
    # components-channel filter
    component_type: str | None = None


class UnifiedSearchOut(BaseModel):
    query: str
    knowledge: list[dict] = Field(default_factory=list)
    components: list[dict] = Field(default_factory=list)
    projects: list[dict] = Field(default_factory=list)


async def _search_knowledge(body: UnifiedSearchIn) -> list[dict]:
    """Vector + lexical dual-channel, RRF-fused. Each channel degrades
    to empty on failure; both failing yields [] without raising."""
    vector_hits: list[dict] = []
    lexical_hits: list[dict] = []

    try:
        vector_hits = await rag_engine.search(
            query=body.query,
            top_k=body.top_k,
            category_filter=body.category_filter,
            manufacturer_filter=body.manufacturer_filter,
        )
    except Exception as e:
        log.warning("unified_search: vector channel failed (degraded): %s", e)

    try:
        lexical_hits = await rag_engine.lexical_search(
            query=body.query,
            top_k=body.top_k,
            category_filter=body.category_filter,
            manufacturer_filter=body.manufacturer_filter,
        )
    except Exception as e:
        log.warning("unified_search: lexical channel failed (degraded): %s", e)

    by_id: dict[str, dict] = {}
    for hit in vector_hits:
        by_id.setdefault(str(hit.get("id")), dict(hit))
    for hit in lexical_hits:
        key = str(hit.get("id"))
        if key in by_id:
            # Same chunk found by both channels — mark it, keep vector score
            by_id[key]["lexical"] = True
        else:
            by_id[key] = dict(hit)

    fused_ids = rrf_merge(
        [[str(h.get("id")) for h in vector_hits], [str(h.get("id")) for h in lexical_hits]]
    )
    results = []
    for i, cid in enumerate(fused_ids[: body.top_k]):
        item = by_id.get(cid)
        if not item:
            continue
        item.setdefault("source", "vector")
        item["rank"] = i + 1
        results.append(item)
    return results


@router.post("/api/search", response_model=UnifiedSearchOut)
async def unified_search(
    body: UnifiedSearchIn,
    session: AsyncSession = Depends(get_session),
) -> UnifiedSearchOut:
    sources = set(body.sources) if body.sources else ALLOWED_SOURCES
    # Unknown source names are ignored rather than rejected — callers that
    # send a stale enum should still get results from the valid channels.
    sources &= ALLOWED_SOURCES
    if not sources:
        sources = ALLOWED_SOURCES

    out = UnifiedSearchOut(query=body.query)

    if "knowledge" in sources:
        try:
            out.knowledge = await _search_knowledge(body)
        except Exception as e:
            log.warning("unified_search: knowledge source failed: %s", e)

    if "components" in sources:
        try:
            out.components = await graph_lexical_search(
                session,
                query=body.query,
                limit=body.top_k,
                component_type=body.component_type,
            )
        except Exception as e:
            log.warning("unified_search: components source failed: %s", e)

    if "projects" in sources:
        try:
            out.projects = await project_text_search(
                session, query=body.query, limit=body.top_k
            )
        except Exception as e:
            log.warning("unified_search: projects source failed: %s", e)

    return out
