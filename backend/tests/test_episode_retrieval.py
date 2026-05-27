"""Top-N episode retrieval helpers (M3 Track B).

Covers the deterministic ``top_episodes`` + ``format_for_prompt`` API.
We don't need the full graph here — these are pure-SQL / pure-string
helpers so we exercise them directly against the test SQLite DB.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.core.episode_retrieval import format_for_prompt, top_episodes
from app.db.models import EpisodicMemory, Organization, Project
from app.db.repository import async_session


pytestmark = pytest.mark.asyncio


async def _make_org(name: str = "EpRetrieveOrg") -> str:
    """Insert an Organization row, return its id (FK target for episodes)."""
    org_id = str(uuid.uuid4())
    async with async_session() as session:
        session.add(
            Organization(
                id=org_id,
                name=name,
                code=f"{name.lower()}-{uuid.uuid4().hex[:8]}",
                token_hash=uuid.uuid4().hex,
            )
        )
        await session.commit()
    return org_id


async def _make_project(org_id: str | None = None) -> str:
    project_id = str(uuid.uuid4())
    async with async_session() as session:
        session.add(Project(id=project_id, name="ep-test", org_id=org_id))
        await session.commit()
    return project_id


async def _seed_episode(
    *,
    org_id: str | None,
    project_id: str,
    machine_type: str | None = None,
    summary: str = "demo",
    score: float = 0.5,
    created_offset_seconds: int = 0,
) -> str:
    """Insert one EpisodicMemory row with explicit ``created_at`` so the
    recency ordering test stays deterministic."""
    ep_id = str(uuid.uuid4())
    async with async_session() as session:
        session.add(
            EpisodicMemory(
                id=ep_id,
                project_id=project_id,
                org_id=org_id,
                requirement_snapshot=(
                    {"machine_type": machine_type} if machine_type else {}
                ),
                bom_snapshot=[],
                key_decisions=[],
                summary=summary,
                score=score,
                created_at=datetime.now(timezone.utc)
                + timedelta(seconds=created_offset_seconds),
            )
        )
        await session.commit()
    return ep_id


# 1. Empty org → empty list, format_for_prompt → "" ──────────────────────
async def test_top_episodes_returns_empty_for_org_with_no_history():
    org_id = await _make_org("EmptyOrg")
    async with async_session() as session:
        rows = await top_episodes(session, org_id=org_id)
    assert rows == []
    assert format_for_prompt(rows) == ""

    # And the no-org-id path is also a hard pass-through (no DB hit).
    async with async_session() as session:
        assert await top_episodes(session, org_id=None) == []


# 2. Recency-ordered top-3 across 5 seeded episodes ─────────────────────
async def test_top_episodes_returns_three_most_recent_in_descending_order():
    org_id = await _make_org("RecentOrg")
    project_id = await _make_project(org_id)
    # Seed 5 episodes with strictly increasing created_at
    seeded: list[str] = []
    for i in range(5):
        ep_id = await _seed_episode(
            org_id=org_id,
            project_id=project_id,
            summary=f"episode-{i}",
            score=0.4 + 0.1 * i,
            created_offset_seconds=i,
        )
        seeded.append(ep_id)

    async with async_session() as session:
        rows = await top_episodes(session, org_id=org_id, limit=3)

    assert len(rows) == 3
    # Newest first: indexes 4, 3, 2
    assert [r.summary for r in rows] == ["episode-4", "episode-3", "episode-2"]

    # format_for_prompt produces the expected Chinese block
    block = format_for_prompt(rows)
    assert "[历史相似项目经验]" in block
    assert "1. episode-4" in block
    assert "请参考以上经验做选型。" in block


# 3. machine_type filter narrows + falls back when no match ────────────
async def test_top_episodes_machine_type_filter_with_fallback():
    org_id = await _make_org("MachineTypeOrg")
    project_id = await _make_project(org_id)
    # 2 conveyor episodes (older), 2 slider episodes (newer)
    await _seed_episode(
        org_id=org_id, project_id=project_id,
        machine_type="conveyor", summary="conv-A",
        created_offset_seconds=0,
    )
    await _seed_episode(
        org_id=org_id, project_id=project_id,
        machine_type="conveyor", summary="conv-B",
        created_offset_seconds=1,
    )
    await _seed_episode(
        org_id=org_id, project_id=project_id,
        machine_type="slider", summary="slider-A",
        created_offset_seconds=2,
    )
    await _seed_episode(
        org_id=org_id, project_id=project_id,
        machine_type="slider", summary="slider-B",
        created_offset_seconds=3,
    )

    # machine_type="conveyor" → only conveyor episodes
    async with async_session() as session:
        rows = await top_episodes(
            session, org_id=org_id, machine_type="conveyor", limit=5,
        )
    summaries = [r.summary for r in rows]
    assert set(summaries) == {"conv-A", "conv-B"}

    # machine_type="palletizer" (none seeded) → falls back to recent slider
    async with async_session() as session:
        fb_rows = await top_episodes(
            session, org_id=org_id, machine_type="palletizer", limit=2,
        )
    fb_summaries = [r.summary for r in fb_rows]
    assert fb_summaries == ["slider-B", "slider-A"]
