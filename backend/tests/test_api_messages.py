"""API tests for chat_messages persistence (M0 Track B).

Uses the codebase's existing inline AsyncClient pattern (see
test_api_topology.py). conftest.py only provides an autouse
`setup_database` fixture — there is no `async_client` /
`async_session` shared fixture, so we wire the transport per-test.
"""
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


async def _make_project(client: AsyncClient) -> str:
    # POST /api/projects takes the name as a query parameter and
    # returns 201 Created (see app/api/projects.py).
    resp = await client.post("/api/projects?name=test-msg")
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_append_and_list_round_trip():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        pid = await _make_project(client)

        a = await client.post(
            f"/api/projects/{pid}/messages",
            json={"role": "user", "content": "hi"},
        )
        assert a.status_code == 200, a.text
        a_body = a.json()
        assert a_body["sequence"] == 0
        assert a_body["role"] == "user"
        assert a_body["content"] == "hi"
        assert a_body["project_id"] == pid

        b = await client.post(
            f"/api/projects/{pid}/messages",
            json={
                "role": "assistant",
                "content": "hello",
                "options": [{"key": "k", "label": "l", "choices": ["a"]}],
            },
        )
        assert b.status_code == 200, b.text
        assert b.json()["sequence"] == 1

        listing = await client.get(f"/api/projects/{pid}/messages")
        assert listing.status_code == 200
        msgs = listing.json()
        assert [m["content"] for m in msgs] == ["hi", "hello"]
        assert msgs[0]["sequence"] == 0
        assert msgs[1]["sequence"] == 1
        assert msgs[1]["options"] == [{"key": "k", "label": "l", "choices": ["a"]}]


@pytest.mark.asyncio
async def test_listing_unknown_project_returns_404():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/projects/00000000-0000-0000-0000-000000000000/messages"
        )
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_append_unknown_project_returns_404():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/projects/00000000-0000-0000-0000-000000000000/messages",
            json={"role": "user", "content": "x"},
        )
        assert resp.status_code == 404
