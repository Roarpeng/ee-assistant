"""Clarify-answer writeback API tests.

These tests exercise the full request path:
    POST /api/projects/{project_id}/clarify/answer
        with header  X-Volta-Org-Token: <bootstrap token>

The endpoint relies on:
  - Track A's middleware + `Organization`/`OrgPreference` models
    (mounted in app.main on import)
  - Track A's POST /api/orgs bootstrap (used here to mint a token)
  - Track B's clarify_answer router (mounted lazily below if main.py
    hasn't yet been edited to include it)
"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.main import app
from app.db.models import OrgPreference
from app.db.repository import async_session


# ── Lazy registration of Track A + Track B routes/middleware ─────────────
# In production, `app.main` includes both Track A's (org middleware + orgs
# router) and Track B's (clarify_answer router) when integrated. For tests
# we register defensively so the suite works whether or not main.py has
# been edited yet (the integration step runs after parallel tracks land).
def _ensure_routes_and_middleware_mounted() -> None:
    orgs_prefix = "/api/orgs"
    if not any(getattr(r, "path", "").startswith(orgs_prefix) for r in app.routes):
        from app.api.orgs import router as orgs_router
        app.include_router(orgs_router)

    clarify_prefix = "/api/projects/{project_id}/clarify"
    if not any(getattr(r, "path", "").startswith(clarify_prefix) for r in app.routes):
        from app.api.clarify_answer import router as clarify_router
        app.include_router(clarify_router)

    # Track A's middleware. We use a module-level marker on `app` itself so
    # double-registration is impossible regardless of pytest collection order.
    # We also clear `app.middleware_stack` because Starlette builds the stack
    # lazily on first request and caches it — if some earlier test already
    # touched `app`, our late-added middleware wouldn't take effect without
    # forcing a rebuild on the next request.
    if not getattr(app, "_volta_org_middleware_registered", False):
        from app.middleware.org_auth import org_auth_middleware
        app.middleware("http")(org_auth_middleware)
        app.middleware_stack = None
        app._volta_org_middleware_registered = True


_ensure_routes_and_middleware_mounted()


pytestmark = pytest.mark.asyncio


async def _new_client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _bootstrap_org(client: AsyncClient, name: str) -> tuple[str, dict[str, str]]:
    """POST /api/orgs to mint a brand-new org + token. Returns (org_id, auth_headers)."""
    resp = await client.post("/api/orgs", json={"name": name})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    return body["id"], {"X-Volta-Org-Token": body["token"]}


async def _fetch_pref(org_id: str, key: str) -> OrgPreference | None:
    async with async_session() as session:
        return (await session.execute(
            select(OrgPreference).where(
                OrgPreference.org_id == org_id,
                OrgPreference.key == key,
            )
        )).scalar_one_or_none()


# 1. writes a new pref at confidence 0.6 ────────────────────────────────
async def test_writeback_creates_new_preference_at_initial_confidence():
    async with await _new_client() as client:
        org_id, headers = await _bootstrap_org(client, "WriteOrg")

        resp = await client.post(
            "/api/projects/proj-1/clarify/answer",
            headers=headers,
            json={"answers": {"safety_level": "SIL2 / PLd"}},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["project_id"] == "proj-1"
        assert len(body["written"]) == 1
        row = body["written"][0]
        assert row["key"] == "default_safety_level"
        assert row["value"] == {"level": "SIL2 / PLd"}
        assert row["confidence"] == pytest.approx(0.6)

        pref = await _fetch_pref(org_id, "default_safety_level")
        assert pref is not None
        assert pref.confidence == pytest.approx(0.6)
        assert pref.source == "clarify"
        assert pref.value == {"level": "SIL2 / PLd"}


# 2. bumps confidence by +0.1 when value matches existing row ───────────
async def test_writeback_bumps_confidence_when_value_matches():
    async with await _new_client() as client:
        org_id, headers = await _bootstrap_org(client, "BumpOrg")

        await client.post(
            "/api/projects/p/clarify/answer",
            headers=headers,
            json={"answers": {"plc_family": "S7-1200 (≤3轴)"}},
        )
        resp = await client.post(
            "/api/projects/p/clarify/answer",
            headers=headers,
            json={"answers": {"plc_family": "S7-1200 (≤3轴)"}},
        )
        assert resp.status_code == 200
        row = resp.json()["written"][0]
        assert row["confidence"] == pytest.approx(0.7)

        pref = await _fetch_pref(org_id, "preferred_plc_family")
        assert pref is not None
        assert pref.confidence == pytest.approx(0.7)
        assert pref.value == {"family": "S7-1200 (≤3轴)"}


# 3. resets confidence to 0.6 when the same key gets a NEW value ────────
async def test_writeback_resets_confidence_when_value_changes():
    async with await _new_client() as client:
        org_id, headers = await _bootstrap_org(client, "ResetOrg")

        # Seed three times with same value: create@0.6 → bump@0.7 → bump@0.8
        for _ in range(3):
            await client.post(
                "/api/projects/p/clarify/answer",
                headers=headers,
                json={"answers": {"environment": "室内 (IP20)"}},
            )
        seeded = await _fetch_pref(org_id, "default_environment")
        assert seeded is not None
        assert seeded.confidence == pytest.approx(0.8)

        # Now change the value — confidence must drop back to 0.6
        resp = await client.post(
            "/api/projects/p/clarify/answer",
            headers=headers,
            json={"answers": {"environment": "潮湿/腐蚀 (IP65)"}},
        )
        assert resp.status_code == 200
        row = resp.json()["written"][0]
        assert row["confidence"] == pytest.approx(0.6)
        assert row["value"] == {"env": "潮湿/腐蚀 (IP65)"}

        pref = await _fetch_pref(org_id, "default_environment")
        assert pref is not None
        assert pref.value == {"env": "潮湿/腐蚀 (IP65)"}
        assert pref.confidence == pytest.approx(0.6)


# 4. unknown group keys are silently skipped ────────────────────────────
async def test_writeback_ignores_unknown_group_keys():
    async with await _new_client() as client:
        org_id, headers = await _bootstrap_org(client, "GhostOrg")

        resp = await client.post(
            "/api/projects/p/clarify/answer",
            headers=headers,
            json={"answers": {
                "totally_unknown_group": "whatever",
                "another_bogus_field": "x",
            }},
        )
        assert resp.status_code == 200
        assert resp.json()["written"] == []

        # And no row was written for that org
        async with async_session() as session:
            rows = (await session.execute(
                select(OrgPreference).where(OrgPreference.org_id == org_id)
            )).scalars().all()
            assert rows == []


# 5. missing token → 401 ────────────────────────────────────────────────
async def test_writeback_rejects_request_without_org_token():
    async with await _new_client() as client:
        resp = await client.post(
            "/api/projects/p/clarify/answer",
            json={"answers": {"safety_level": "SIL2 / PLd"}},
        )
        assert resp.status_code == 401
