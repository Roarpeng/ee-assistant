"""Tests for the deterministic episode extractor (M3 Track A).

Three cases (matching the plan §A7 contract):
  1. Populated final_state + decisions → non-empty summary, row persisted.
  2. Bare/empty state with zero decisions → extractor returns None,
     no row inserted (we don't pollute the table with junk).
  3. ``manual_select`` decisions distil correctly into ``key_decisions``.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.decisions_service import record_decision
from app.core.episode_extractor import extract_and_store_episode
from app.db.models import EpisodicMemory, Project
from app.db.repository import async_session

pytestmark = pytest.mark.asyncio


async def _make_project(name: str = "EpisodeTest") -> str:
    pid = str(uuid.uuid4())
    async with async_session() as session:
        session.add(Project(id=pid, name=name, status="done"))
        await session.commit()
    return pid


async def test_populated_state_produces_summary_and_persists_row():
    pid = await _make_project()
    final_state = {
        "project_id": pid,
        "requirement": {
            "machine_type": "滑台",
            "safety_level": "SIL2",
        },
        "bom_items": [
            {"category": "PLC_CPU", "manufacturer": "Siemens", "model": "CPU 1215C"},
            {"category": "IO_Module", "manufacturer": "Siemens", "model": "DI16"},
        ],
    }

    async with async_session() as session:
        await record_decision(
            session,
            project_id=pid,
            org_id=None,
            type="manual_select",
            context={},
            before={"model": "CPU 1212C"},
            after={"category": "PLC_CPU", "model": "CPU 1215C"},
        )
        await record_decision(
            session,
            project_id=pid,
            org_id=None,
            type="bom_edit",
            context={},
        )

    ep_id = await extract_and_store_episode(pid, None, final_state)
    assert ep_id, "extractor should return a UUID for populated state"
    uuid.UUID(ep_id)

    async with async_session() as session:
        row = (
            await session.execute(
                select(EpisodicMemory).where(EpisodicMemory.id == ep_id)
            )
        ).scalar_one()
        assert row.project_id == pid
        assert row.summary, "summary must be non-empty"
        assert "滑台" in row.summary
        assert "SIL2" in row.summary
        assert "CPU 1215C" in row.summary
        # 1 manual + 1 edit captured in key_decisions
        types = [kd["type"] for kd in row.key_decisions]
        assert types.count("manual_select") == 1
        assert types.count("bom_edit") == 1
        # Score scales with #key_decisions (2 → 0.4 + 0.2 = 0.6)
        assert row.score == pytest.approx(0.6, abs=0.01)


async def test_bare_state_returns_none_and_inserts_nothing():
    pid = await _make_project("EpisodeEmpty")
    final_state = {
        "project_id": pid,
        "requirement": None,
        "bom_items": None,
    }

    ep_id = await extract_and_store_episode(pid, None, final_state)
    assert ep_id is None

    async with async_session() as session:
        rows = (
            await session.execute(
                select(EpisodicMemory).where(EpisodicMemory.project_id == pid)
            )
        ).scalars().all()
    assert rows == []


async def test_key_decisions_compacts_manual_select_correctly():
    pid = await _make_project("EpisodeKeyDec")
    async with async_session() as session:
        await record_decision(
            session,
            project_id=pid,
            org_id=None,
            type="manual_select",
            context={"source": "test"},
            before={"model": "CPU 1212C"},
            after={
                "category": "PLC_CPU",
                "manufacturer": "Siemens",
                "model": "CPU 1215C",
            },
            rationale="AI 通道不够",
        )
        # ``thumbs_down`` is intentionally skipped from key_decisions
        await record_decision(
            session,
            project_id=pid,
            org_id=None,
            type="thumbs_down",
            context={"category": "VFD"},
        )

    final_state = {
        "project_id": pid,
        "requirement": {"machine_type": "传送带"},
        "bom_items": [],
    }
    ep_id = await extract_and_store_episode(pid, None, final_state)
    assert ep_id

    async with async_session() as session:
        row = (
            await session.execute(
                select(EpisodicMemory).where(EpisodicMemory.id == ep_id)
            )
        ).scalar_one()

    assert len(row.key_decisions) == 1, "thumbs_down should not appear in key_decisions"
    kd = row.key_decisions[0]
    assert kd["type"] == "manual_select"
    assert kd["cat"] == "PLC_CPU"
    assert kd["before"] == "CPU 1212C"
    assert kd["after"] == "CPU 1215C"
    assert kd["rationale"] == "AI 通道不够"
