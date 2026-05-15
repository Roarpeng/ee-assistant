"""Admin memory consolidation HTTP endpoints (M3 Track B).

Same hermetic-app pattern as ``test_api_orgs.py`` and
``test_api_feedback.py``: build a local FastAPI app, register the
middleware + router, exercise via ``ASGITransport``.
"""
from __future__ import annotations

import asyncio

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.api.admin_memory import router as admin_memory_router
from app.api.orgs import router as orgs_router
from app.db.models import WeeklyMemoryReport
from app.db.repository import async_session
from app.middleware.org_auth import org_auth_middleware


pytestmark = pytest.mark.asyncio


def _build_app() -> FastAPI:
    a = FastAPI()
    a.middleware("http")(org_auth_middleware)
    a.include_router(orgs_router)
    a.include_router(admin_memory_router)
    return a


app = _build_app()


async def _new_client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _bootstrap_org(c: AsyncClient, name: str = "AdmCo") -> dict[str, str]:
    crt = (await c.post("/api/orgs", json={"name": name})).json()
    return {"X-Volta-Org-Token": crt["token"], "_org_id": crt["id"]}


# 1. POST creates a report row + returns the summary block ────────────
async def test_consolidate_now_creates_persisted_report():
    async with await _new_client() as c:
        headers = await _bootstrap_org(c, "ConsolidateCo")
        org_id = headers.pop("_org_id")

        r = await c.post(
            "/api/admin/consolidate-memory",
            headers=headers,
            json={"days": 14},
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert "report_id" in body and body["report_id"]
        assert "summary" in body
        # An empty org → empty arrays + zero metrics
        assert body["summary"]["new_rules"] == []
        assert body["summary"]["metrics"]["decisions_scanned"] == 0

        # The row really landed in the DB and is bound to this org
        async with async_session() as session:
            row = (
                await session.execute(
                    select(WeeklyMemoryReport).where(
                        WeeklyMemoryReport.id == body["report_id"]
                    )
                )
            ).scalar_one()
            assert row.org_id == org_id


# 2. GET /memory-reports returns most-recent first ────────────────────
async def test_list_memory_reports_returns_newest_first():
    async with await _new_client() as c:
        headers = await _bootstrap_org(c, "ListCo")

        # Create two reports with a tiny gap so their server_default
        # `created_at` differ (SQLite's CURRENT_TIMESTAMP has 1-second
        # resolution; without the sleep both rows can tie and the
        # ORDER BY DESC becomes non-deterministic).
        first = (
            await c.post(
                "/api/admin/consolidate-memory",
                headers=headers,
                json={"days": 7},
            )
        ).json()
        await asyncio.sleep(1.1)
        second = (
            await c.post(
                "/api/admin/consolidate-memory",
                headers=headers,
                json={"days": 7},
            )
        ).json()

        r = await c.get("/api/orgs/me/memory-reports", headers=headers)
        assert r.status_code == 200, r.text
        items = r.json()
        assert len(items) == 2
        # newest first → second comes before first
        ids = [it["id"] for it in items]
        assert ids[0] == second["report_id"]
        assert ids[1] == first["report_id"]
        assert items[0]["metrics"]["decisions_scanned"] == 0


# 3. Both endpoints require the org token ─────────────────────────────
async def test_admin_memory_endpoints_require_org_token():
    async with await _new_client() as c:
        r1 = await c.post(
            "/api/admin/consolidate-memory",
            json={"days": 7},
        )
        assert r1.status_code == 401, r1.text

        r2 = await c.get("/api/orgs/me/memory-reports")
        assert r2.status_code == 401, r2.text
