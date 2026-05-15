"""API tests for the M2 memory-sources GET endpoint (Track A).

Hermetic FastAPI app with the org auth middleware + only the routers
this test exercises (orgs, projects, feedback, memory_sources). The
parent integration step is responsible for registering
``memory_sources.router`` in production ``app/main.py``.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.feedback import router as feedback_router
from app.api.memory_sources import router as memory_sources_router
from app.api.orgs import router as orgs_router
from app.api.projects import router as projects_router
from app.middleware.org_auth import org_auth_middleware

pytestmark = pytest.mark.asyncio


def _build_app() -> FastAPI:
    a = FastAPI()
    a.middleware("http")(org_auth_middleware)
    a.include_router(orgs_router)
    a.include_router(projects_router)
    a.include_router(feedback_router)
    a.include_router(memory_sources_router)
    return a


app = _build_app()


async def _new_client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _bootstrap(c: AsyncClient, name: str) -> tuple[str, dict[str, str]]:
    crt = (await c.post("/api/orgs", json={"name": name})).json()
    headers = {"X-Volta-Org-Token": crt["token"]}
    proj = await c.post(f"/api/projects?name={name}-Project")
    assert proj.status_code == 201, proj.text
    return proj.json()["id"], headers


def _ms_url(pid: str, category: str, manufacturer: str, model: str) -> str:
    return (
        f"/api/projects/{pid}/memory-sources/"
        f"{category}/{manufacturer}/{model}"
    )


async def test_no_signals_returns_all_zeros():
    async with await _new_client() as c:
        pid, headers = await _bootstrap(c, "MS-Empty")
        r = await c.get(
            _ms_url(pid, "PLC_CPU", "Siemens", "S7-1215C"),
            headers=headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["org_pref_match"] is False
        assert body["selection_weight"] == 0.0
        assert body["similar_episodes_count"] == 0
        assert body["kb_doc_hits"] == 0
        assert body["total_signals"] == 0


async def test_selection_weight_signal_alone():
    async with await _new_client() as c:
        pid, headers = await _bootstrap(c, "MS-Weight")
        # Bump the weight by POSTing a select feedback for the same triple.
        post = await c.post(
            f"/api/projects/{pid}/feedback/select",
            headers=headers,
            json={
                "category": "PLC_CPU",
                "manufacturer": "Siemens",
                "model": "S7-1215C",
            },
        )
        assert post.status_code == 201, post.text

        r = await c.get(
            _ms_url(pid, "PLC_CPU", "Siemens", "S7-1215C"),
            headers=headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["selection_weight"] > 0
        assert body["org_pref_match"] is False
        assert body["total_signals"] == 1


async def test_org_pref_match_via_plc_family_prefix():
    async with await _new_client() as c:
        pid, headers = await _bootstrap(c, "MS-Pref")
        # Seed an org pref that matches Siemens S7-1215C via family prefix.
        u = await c.put(
            "/api/orgs/me/preferences/preferred_plc_family",
            headers=headers,
            json={"value": {"family": "S7-1200"}, "source": "admin"},
        )
        assert u.status_code == 200, u.text

        r = await c.get(
            _ms_url(pid, "PLC_CPU", "Siemens", "S7-1215C"),
            headers=headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["org_pref_match"] is True
        assert body["selection_weight"] == 0.0
        assert body["total_signals"] == 1


async def test_both_signals_present_total_two():
    async with await _new_client() as c:
        pid, headers = await _bootstrap(c, "MS-Both")
        u = await c.put(
            "/api/orgs/me/preferences/preferred_plc_family",
            headers=headers,
            json={"value": {"family": "S7-1200"}, "source": "admin"},
        )
        assert u.status_code == 200, u.text
        post = await c.post(
            f"/api/projects/{pid}/feedback/select",
            headers=headers,
            json={
                "category": "PLC_CPU",
                "manufacturer": "Siemens",
                "model": "S7-1215C",
            },
        )
        assert post.status_code == 201, post.text

        r = await c.get(
            _ms_url(pid, "PLC_CPU", "Siemens", "S7-1215C"),
            headers=headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["org_pref_match"] is True
        assert body["selection_weight"] > 0
        assert body["total_signals"] == 2
