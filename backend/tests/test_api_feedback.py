"""API tests for the M2 feedback endpoints (Track A).

Follows the inline ``ASGITransport`` / ``AsyncClient`` pattern from
``test_api_orgs.py`` and builds a hermetic FastAPI app locally. The
parent integration step is responsible for registering ``feedback.router``
inside ``app/main.py`` for production.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.api.feedback import router as feedback_router
from app.api.orgs import router as orgs_router
from app.api.projects import router as projects_router
from app.db.models import Decision, SelectionWeight
from app.db.repository import async_session
from app.middleware.org_auth import org_auth_middleware

pytestmark = pytest.mark.asyncio


def _build_app() -> FastAPI:
    a = FastAPI()
    a.middleware("http")(org_auth_middleware)
    a.include_router(orgs_router)
    a.include_router(projects_router)
    a.include_router(feedback_router)
    return a


app = _build_app()


async def _new_client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _bootstrap_org_and_project(c: AsyncClient) -> tuple[str, dict[str, str]]:
    """Create an org + project; return (project_id, auth-header dict)."""
    crt = (await c.post("/api/orgs", json={"name": "FbCo"})).json()
    headers = {"X-Volta-Org-Token": crt["token"]}
    proj = await c.post("/api/projects?name=FB%20Project")
    assert proj.status_code == 201, proj.text
    return proj.json()["id"], headers


_SELECT_BODY = {
    "category": "PLC_CPU",
    "manufacturer": "Siemens",
    "model": "S7-1215C",
    "before": {"category": "PLC_CPU", "manufacturer": "Siemens", "model": "S7-1212C"},
    "rationale": "more I/O headroom",
}


async def test_select_records_manual_select_decision():
    async with await _new_client() as c:
        pid, headers = await _bootstrap_org_and_project(c)

        r = await c.post(
            f"/api/projects/{pid}/feedback/select",
            headers=headers,
            json=_SELECT_BODY,
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["weight"] == 1.0
        assert "decision_id" in body and body["decision_id"]

        async with async_session() as session:
            row = (
                await session.execute(
                    select(Decision).where(Decision.id == body["decision_id"])
                )
            ).scalar_one()
            assert row.type == "manual_select"
            assert row.project_id == pid
            assert row.org_id is not None
            assert row.after == {
                "category": "PLC_CPU",
                "manufacturer": "Siemens",
                "model": "S7-1215C",
            }
            assert row.rationale == "more I/O headroom"


async def test_select_bumps_selection_weight_each_call():
    async with await _new_client() as c:
        pid, headers = await _bootstrap_org_and_project(c)

        r1 = await c.post(
            f"/api/projects/{pid}/feedback/select",
            headers=headers,
            json=_SELECT_BODY,
        )
        assert r1.status_code == 201
        assert r1.json()["weight"] == 1.0

        r2 = await c.post(
            f"/api/projects/{pid}/feedback/select",
            headers=headers,
            json=_SELECT_BODY,
        )
        assert r2.status_code == 201
        assert r2.json()["weight"] == 2.0

        async with async_session() as session:
            rows = (
                await session.execute(
                    select(SelectionWeight).where(
                        SelectionWeight.category == "PLC_CPU",
                        SelectionWeight.manufacturer == "Siemens",
                        SelectionWeight.model == "S7-1215C",
                    )
                )
            ).scalars().all()
            assert len(rows) == 1
            assert rows[0].weight == 2.0


async def test_edit_with_target_bom_records_bom_edit():
    async with await _new_client() as c:
        pid, headers = await _bootstrap_org_and_project(c)

        r = await c.post(
            f"/api/projects/{pid}/feedback/edit",
            headers=headers,
            json={
                "target": "bom",
                "before": {"quantity": 1},
                "after": {"quantity": 2},
                "rationale": "spare module",
            },
        )
        assert r.status_code == 201, r.text
        decision_id = r.json()["decision_id"]

        async with async_session() as session:
            row = (
                await session.execute(
                    select(Decision).where(Decision.id == decision_id)
                )
            ).scalar_one()
            assert row.type == "bom_edit"
            assert row.context["target"] == "bom"
            assert row.before == {"quantity": 1}
            assert row.after == {"quantity": 2}


async def test_negative_records_thumbs_down():
    async with await _new_client() as c:
        pid, headers = await _bootstrap_org_and_project(c)

        r = await c.post(
            f"/api/projects/{pid}/feedback/negative",
            headers=headers,
            json={
                "target": "bom_row",
                "context": {"row_id": "abc-123"},
                "rationale": "wrong protocol",
            },
        )
        assert r.status_code == 201, r.text
        decision_id = r.json()["decision_id"]

        async with async_session() as session:
            row = (
                await session.execute(
                    select(Decision).where(Decision.id == decision_id)
                )
            ).scalar_one()
            assert row.type == "thumbs_down"
            assert row.context["target"] == "bom_row"
            assert row.context["row_id"] == "abc-123"


async def test_all_three_endpoints_require_org_token():
    async with await _new_client() as c:
        # We still need a valid project so the 401 isn't masked by 404
        # routing on a projects-prefix typo. Make one with a throwaway
        # org, then drop the auth header on the actual feedback POSTs.
        pid, _ = await _bootstrap_org_and_project(c)

        r1 = await c.post(
            f"/api/projects/{pid}/feedback/select",
            json=_SELECT_BODY,
        )
        assert r1.status_code == 401, r1.text

        r2 = await c.post(
            f"/api/projects/{pid}/feedback/edit",
            json={"target": "bom", "before": {}, "after": {}},
        )
        assert r2.status_code == 401, r2.text

        r3 = await c.post(
            f"/api/projects/{pid}/feedback/negative",
            json={"target": "general", "context": {}},
        )
        assert r3.status_code == 401, r3.text


async def test_select_with_unknown_project_returns_404():
    async with await _new_client() as c:
        crt = (await c.post("/api/orgs", json={"name": "MissingProj"})).json()
        headers = {"X-Volta-Org-Token": crt["token"]}
        r = await c.post(
            "/api/projects/00000000-0000-0000-0000-000000000000/feedback/select",
            headers=headers,
            json=_SELECT_BODY,
        )
        assert r.status_code == 404, r.text
