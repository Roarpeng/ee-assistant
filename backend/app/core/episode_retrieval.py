"""Top-N episodic memory retrieval for the selection supervisor (M3 Track B).

SQL-only implementation for M3.0 — recency over an org-id filter, with an
optional ``machine_type`` narrowing on the JSON ``requirement_snapshot``.
M3.6 will swap this for a Qdrant hybrid search; the public API
(``top_episodes`` + ``format_for_prompt``) is the contract that callers
should depend on.

Design notes
------------
* ``top_episodes`` returns ``[]`` when ``org_id`` is falsy, mirroring the
  org-scoped behaviour of `_apply_org_bias` — without an org we have no
  signal to retrieve against.
* When ``machine_type`` matches at least one episode, we *prefer* the
  filtered result. If the filter narrows to zero rows we fall back to
  any-type recent episodes so a brand-new use-case still gets some
  context (better stale signal than no signal).
* ``format_for_prompt`` is intentionally pure (no DB / network). Tests
  pin the exact string shape so downstream prompt assembly stays stable.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import EpisodicMemory


async def top_episodes(
    session: AsyncSession,
    org_id: str | None,
    machine_type: str | None = None,
    limit: int = 3,
) -> list[EpisodicMemory]:
    """Return up to ``limit`` recent episodes for this org.

    Without an ``org_id`` we return an empty list — episodes are an
    org-scoped signal today. ``machine_type``, when supplied, is used
    as a "prefer-but-not-require" narrowing on
    ``requirement_snapshot.machine_type``.
    """
    if not org_id:
        return []

    base = select(EpisodicMemory).where(EpisodicMemory.org_id == org_id)

    if machine_type:
        # Cross-dialect JSON access: SQLite (test) lacks the same JSON
        # operators as Postgres (prod). Fetch the org's recent rows
        # once and filter in Python — N here is bounded by `limit * 4`
        # at most.
        prefilter = (
            await session.execute(
                base.order_by(EpisodicMemory.created_at.desc()).limit(limit * 4)
            )
        ).scalars().all()
        primary = [
            ep for ep in prefilter
            if (ep.requirement_snapshot or {}).get("machine_type") == machine_type
        ][:limit]
        if primary:
            return primary

    rows = (
        await session.execute(
            base.order_by(EpisodicMemory.created_at.desc()).limit(limit)
        )
    ).scalars().all()
    return list(rows)


def format_for_prompt(episodes: list[EpisodicMemory]) -> str:
    """Render a list of episodes into a Chinese natural-language block
    suitable for prepending to a selection-supervisor prompt.

    Returns ``""`` for an empty list so callers can do
    ``if (block := format_for_prompt(eps)): ...`` without an explicit
    length check.
    """
    if not episodes:
        return ""
    lines = ["[历史相似项目经验]"]
    for i, ep in enumerate(episodes, 1):
        summary = ep.summary or "(无摘要)"
        kd_count = len(ep.key_decisions or [])
        score = float(ep.score or 0.0)
        lines.append(
            f"{i}. {summary} (评分 {score:.2f}, {kd_count} 处关键决策)"
        )
    lines.append("请参考以上经验做选型。")
    return "\n".join(lines)
