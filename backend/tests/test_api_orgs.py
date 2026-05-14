"""API tests for organizations + preferences (M1 Track A).

Uses the inline ``ASGITransport`` / ``AsyncClient`` pattern, matching
``test_api_topology.py`` and ``test_api_messages.py``.

NOTE: per the Track A scope, this test file constructs its own FastAPI
app instance and registers the middleware + router locally. The parent
integration step is responsible for registering them inside
``app/main.py`` for production. Building the app here keeps the tests
hermetic and independent of that integration.
"""
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.orgs import router as orgs_router
from app.middleware.org_auth import org_auth_middleware

pytestmark = pytest.mark.asyncio


def _build_app() -> FastAPI:
    a = FastAPI()
    a.middleware("http")(org_auth_middleware)
    a.include_router(orgs_router)
    return a


app = _build_app()


async def _new_client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_create_org_returns_token_once():
    async with await _new_client() as c:
        r = await c.post("/api/orgs", json={"name": "Acme"})
        assert r.status_code == 201
        body = r.json()
        assert body["name"] == "Acme"
        assert "token" in body and len(body["token"]) > 20
        assert "code" in body and body["code"].startswith("acme-")


async def test_me_requires_token():
    async with await _new_client() as c:
        r = await c.get("/api/orgs/me")
        assert r.status_code == 401


async def test_me_with_valid_token():
    async with await _new_client() as c:
        crt = (await c.post("/api/orgs/me-test", json={"name": "Alpha"}))  # wrong path on purpose? no
        crt = (await c.post("/api/orgs", json={"name": "Alpha"}))
        token = crt.json()["token"]
        r = await c.get("/api/orgs/me", headers={"X-Volta-Org-Token": token})
        assert r.status_code == 200
        assert r.json()["name"] == "Alpha"


async def test_pref_upsert_and_list():
    async with await _new_client() as c:
        crt = (await c.post("/api/orgs", json={"name": "Beta"})).json()
        h = {"X-Volta-Org-Token": crt["token"]}
        u = await c.put(
            "/api/orgs/me/preferences/preferred_plc_family",
            headers=h,
            json={"value": {"family": "S7-1200"}, "confidence": 0.9, "source": "admin"},
        )
        assert u.status_code == 200
        assert u.json()["confidence"] == 0.9

        lst = await c.get("/api/orgs/me/preferences", headers=h)
        assert lst.status_code == 200
        items = lst.json()
        assert any(i["key"] == "preferred_plc_family" for i in items)


async def test_pref_delete():
    async with await _new_client() as c:
        crt = (await c.post("/api/orgs", json={"name": "Gamma"})).json()
        h = {"X-Volta-Org-Token": crt["token"]}
        await c.put(
            "/api/orgs/me/preferences/default_safety_level",
            headers=h,
            json={"value": {"level": "SIL2"}},
        )
        d = await c.delete("/api/orgs/me/preferences/default_safety_level", headers=h)
        assert d.status_code == 204
        lst = (
            await c.get("/api/orgs/me/preferences", headers=h)
        ).json() if False else (
            await c.get("/api/orgs/me/preferences", headers=h)
        ).json()
        assert all(i["key"] != "default_safety_level" for i in lst)


async def test_invalid_token_rejected():
    async with await _new_client() as c:
        r = await c.get("/api/orgs/me", headers={"X-Volta-Org-Token": "bogus"})
        assert r.status_code == 401
