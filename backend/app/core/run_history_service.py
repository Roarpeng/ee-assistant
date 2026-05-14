"""Per-analysis-run telemetry capture.

`start_run()` returns a UUID; the orchestrator stashes it in
``AnalysisState["run_history_id"]`` so the same id is available on both
the initial stream and any subsequent resume. `finish_run()` closes the
row out with per-node timings, the final stage, and any errors caught
by the orchestrator's stream loop.

Both helpers are intentionally **best-effort** — a DB hiccup must never
break a running graph. ``start_run`` swallows exceptions and returns
``None``; ``finish_run`` no-ops when its ``run_id`` is ``None``.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import update

from app.db.models import RunHistory
from app.db.repository import async_session


async def start_run(project_id: str) -> str | None:
    """Insert a new ``run_history`` row, return its id (or None on error)."""
    try:
        async with async_session() as session:
            row = RunHistory(project_id=project_id, started_at=datetime.utcnow())
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return row.id
    except Exception:
        return None


async def finish_run(
    run_id: str | None,
    *,
    nodes_executed: dict[str, float] | None = None,
    errors: list[dict] | None = None,
    final_stage: str | None = None,
) -> None:
    """Mark the run finished and write timings / errors / final stage.

    No-op when ``run_id`` is None — keeps the orchestrator caller branch-free.
    """
    if not run_id:
        return
    try:
        async with async_session() as session:
            await session.execute(
                update(RunHistory)
                .where(RunHistory.id == run_id)
                .values(
                    finished_at=datetime.utcnow(),
                    nodes_executed=nodes_executed or {},
                    errors=errors or [],
                    final_stage=final_stage,
                )
            )
            await session.commit()
    except Exception:
        pass
