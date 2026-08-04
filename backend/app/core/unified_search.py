"""Unified search core — RRF fusion + lexical channels.

Industrial priority: reliability over cleverness.

* ``rrf_merge``: pure, deterministic Reciprocal Rank Fusion — no I/O.
* ``graph_lexical_search``: multi-field ILIKE over ``component_nodes``
  (name / component_type / properties). Works identically on SQLite
  (tests) and PostgreSQL (production). Token AND semantics so an order
  number like ``6ES7215-1AG40`` must hit as a whole, not piecemeal.
* ``project_text_search``: ILIKE over project name/title.

Every channel is best-effort at the API layer: a failing channel
returns empty results and is logged — it must never take down the
whole unified query.
"""
from __future__ import annotations

import logging
import re

from sqlalchemy import String, cast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ComponentNode, Project

log = logging.getLogger(__name__)


# Cap the number of AND-tokens a single query may produce so a
# pathological 10KB string cannot generate a 500-clause WHERE.
MAX_QUERY_TOKENS = 5
# Part numbers / MLFBs are the primary lexical targets; keep tokens of
# length >= 2 to avoid single-character ILIKE explosions.
_TOKEN_RE = re.compile(r"[A-Za-z0-9\u4e00-\u9fff]+")


def tokenize_query(query: str, max_tokens: int = MAX_QUERY_TOKENS) -> list[str]:
    """Split a free-text query into AND-tokens.

    Alphanumeric runs (covers MLFBs like ``6ES7215-1AG40-0XB0`` split
    on ``-``) plus CJK runs. Order-preserving, de-duplicated.
    """
    seen: set[str] = set()
    tokens: list[str] = []
    for m in _TOKEN_RE.finditer(query or ""):
        tok = m.group(0)
        if len(tok) < 2:
            continue
        key = tok.lower()
        if key in seen:
            continue
        seen.add(key)
        tokens.append(tok)
        if len(tokens) >= max_tokens:
            break
    return tokens


def rrf_merge(ranked_lists: list[list[str]], k: int = 60) -> list[str]:
    """Reciprocal Rank Fusion over several ranked id lists.

    score(id) = Σ 1/(k + rank) across every list containing the id
    (rank is 1-based). Deterministic tie-break: earlier first-seen
    order wins. Pure function — trivially unit-testable.
    """
    scores: dict[str, float] = {}
    first_seen: dict[str, int] = {}
    order = 0
    for ranked in ranked_lists:
        seen_in_list: set[str] = set()
        rank = 0
        for item_id in ranked:
            if item_id in seen_in_list:
                continue  # a duplicate within one list must not double-count
            seen_in_list.add(item_id)
            rank += 1
            scores[item_id] = scores.get(item_id, 0.0) + 1.0 / (k + rank)
            if item_id not in first_seen:
                first_seen[item_id] = order
                order += 1
    return sorted(scores, key=lambda i: (-scores[i], first_seen[i]))


def _token_condition(token: str, columns) -> list:
    """ILIKE-%token% over each column; caller ANDs across tokens."""
    pat = f"%{token}%"
    return [col.ilike(pat) for col in columns]


async def graph_lexical_search(
    session: AsyncSession,
    query: str,
    limit: int = 20,
    component_type: str | None = None,
) -> list[dict]:
    """Keyword search over the component knowledge graph.

    Matches when EVERY query token appears in at least one of:
    ``name``, ``component_type``, or the JSON ``properties`` blob
    (covers manufacturer + order_number/MLFB stored in properties).
    Deterministic ordering: name → created_at. Returns plain dicts so
    the result is safe to serialize after the session closes.
    """
    tokens = tokenize_query(query)
    if not tokens:
        return []

    # properties is JSON on both PG and SQLite; casting to String gives
    # a portable ILIKE-able text form on both dialects.
    props_text = cast(ComponentNode.properties, String)
    clauses = [
        or_(*_token_condition(
            tok, [ComponentNode.name, ComponentNode.component_type, props_text]
        ))
        for tok in tokens
    ]

    q = select(ComponentNode).where(*clauses)
    if component_type:
        q = q.where(ComponentNode.component_type.ilike(f"%{component_type}%"))
    q = q.order_by(ComponentNode.name, ComponentNode.created_at).limit(max(1, min(limit, 100)))

    rows = (await session.execute(q)).scalars().all()
    out: list[dict] = []
    for n in rows:
        props = n.properties or {}
        out.append({
            "id": n.id,
            "name": n.name,
            "component_type": n.component_type,
            "manufacturer": str(props.get("manufacturer", "")),
            "order_number": str(props.get("order_number", "")),
            "properties": props,
            "source": "graph",
        })
    return out


async def project_text_search(
    session: AsyncSession,
    query: str,
    limit: int = 10,
) -> list[dict]:
    """Keyword search over project name + title (token AND semantics)."""
    tokens = tokenize_query(query)
    if not tokens:
        return []

    clauses = [
        or_(
            Project.name.ilike(f"%{tok}%"),
            Project.title.ilike(f"%{tok}%"),
        )
        for tok in tokens
    ]
    q = (
        select(Project)
        .where(*clauses)
        .order_by(Project.created_at.desc())
        .limit(max(1, min(limit, 50)))
    )
    rows = (await session.execute(q)).scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "title": p.title,
            "status": p.status,
            "source": "project",
        }
        for p in rows
    ]
