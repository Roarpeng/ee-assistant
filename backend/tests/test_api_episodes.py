"""API tests for episodes listing (M3 Track A).

Same inline-app pattern as ``test_api_orgs.py``: the parent integration
step is responsible for wiring the router into ``app/main.py``; for the
test we build a local FastAPI app so the test file is hermetic and the
main wiring doesn't need to land before Track A's tests can pass.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.episodes import router as episodes_router
from app.api.orgs import router as orgs_router
from app.db.models import EpisodicMemory
from app.db.repository import async_session
from app.middleware.org_auth import org_auth_middleware

pytestmark = pytest.mark.asyncio


def _build_app() -> FastAPI:
    a = FastAPI()
    a.middleware("http")(org_auth_middleware)
    a.include_router(orgs_router)
    a.include_router(episodes_router)
    return a


app = _build_app()


async def _new_client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _create_org(client: AsyncClient, name: str) -> tuple[str, str]:
    """Returns (org_id, token)."""
    r = await client.post("/api/orgs", json={"name": name})
    assert r.status_code == 201, r.text
    body = r.json()
    return body["id"], body["token"]


async def _seed_episode(
    org_id: str,
    *,
    summary: str = "test episode",
    project_name: str = "EpProj",
) -> str:
    """Insert a Project + EpisodicMemory directly via the session — the
    capture-on-done path is exercised by the orchestrator integration
    tests; here we only care about the listing endpoint behaviour."""
    from app.db.models import Project

    pid = str(uuid.uuid4())
    async with async_session() as session:
        session.add(Project(id=pid, name=project_name, status="done", org_id=org_id))
        await session.flush()
        session.add(
            EpisodicMemory(
                project_id=pid,
                org_id=org_id,
                requirement_snapshot={"machine_type": "滑台"},
                bom_snapshot=[],
                key_decisions=[
                    {"type": "manual_select", "cat": "PLC_CPU", "after": "CPU 1215C"}
                ],
                summary=summary,
                score=0.6,
            )
        )
        await session.commit()
    return pid


async def test_list_episodes_empty_returns_empty_array():
    async with await _new_client() as c:
        _, token = await _create_org(c, "EpEmpty")
        r = await c.get(
            "/api/orgs/me/episodes",
            headers={"X-Volta-Org-Token": token},
        )
        assert r.status_code == 200, r.text
        assert r.json() == []


async def test_list_episodes_filters_by_org_and_returns_seeded_row():
    async with await _new_client() as c:
        org_a_id, token_a = await _create_org(c, "EpAlpha")
        org_b_id, token_b = await _create_org(c, "EpBeta")

        await _seed_episode(org_a_id, summary="alpha-episode")
        await _seed_episode(org_b_id, summary="beta-episode")

        r = await c.get(
            "/api/orgs/me/episodes",
            headers={"X-Volta-Org-Token": token_a},
        )
        assert r.status_code == 200
        body = r.json()
        assert len(body) == 1
        assert body[0]["org_id"] == org_a_id
        assert body[0]["summary"] == "alpha-episode"
        assert body[0]["score"] == 0.6
        assert body[0]["key_decisions"][0]["cat"] == "PLC_CPU"


async def test_list_episodes_requires_token():
    async with await _new_client() as c:
        r = await c.get("/api/orgs/me/episodes")
        assert r.status_code == 401
