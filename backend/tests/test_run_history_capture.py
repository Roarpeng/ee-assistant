"""Per-analysis-run telemetry helpers (M2 Track B).

We exercise the helpers directly rather than driving the full LangGraph —
the orchestrator integration is tested implicitly via the surrounding
analysis flow tests, but the two units below pin down the contract:

 1. ``start_run`` returns a UUID, the row exists in DB with finished_at
    still NULL.
 2. ``finish_run`` writes nodes_executed timings and final_stage onto
    the row.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.run_history_service import finish_run, start_run
from app.db.models import Project, RunHistory
from app.db.repository import async_session


pytestmark = pytest.mark.asyncio


async def _make_project(name: str = "RunHistTest") -> str:
    project_id = str(uuid.uuid4())
    async with async_session() as session:
        session.add(Project(id=project_id, name=name, status="draft"))
        await session.commit()
    return project_id


async def test_start_run_returns_uuid_and_inserts_open_row():
    project_id = await _make_project()

    run_id = await start_run(project_id)

    assert run_id, "start_run should return a non-empty UUID"
    # UUID-shaped (parseable)
    uuid.UUID(run_id)

    async with async_session() as session:
        row = (
            await session.execute(select(RunHistory).where(RunHistory.id == run_id))
        ).scalar_one()
        assert row.project_id == project_id
        assert row.started_at is not None
        assert row.finished_at is None  # still open
        assert row.nodes_executed in ({}, {})  # JSON default
        assert row.errors in ([], [])
        assert row.final_stage is None


async def test_finish_run_writes_timings_errors_and_final_stage():
    project_id = await _make_project("RunHistFinish")
    run_id = await start_run(project_id)
    assert run_id

    await finish_run(
        run_id,
        nodes_executed={"requirements_agent": 12.5, "category_mapper": 3.0},
        errors=[{"node": "rule_validator", "error": "timeout"}],
        final_stage="done",
    )

    async with async_session() as session:
        row = (
            await session.execute(select(RunHistory).where(RunHistory.id == run_id))
        ).scalar_one()
        assert row.finished_at is not None
        assert row.nodes_executed == {
            "requirements_agent": 12.5,
            "category_mapper": 3.0,
        }
        assert row.errors == [{"node": "rule_validator", "error": "timeout"}]
        assert row.final_stage == "done"

    # No-op path: finish_run(None) must not raise even though start_run failed.
    await finish_run(None, nodes_executed={"x": 1.0}, final_stage="never")
