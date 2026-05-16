"""Tests for ``POST /api/test-connectivity`` and ``GET /api/llm-providers``.

These probes mock ``app.main.AsyncOpenAI`` so no live network is hit. The
core invariants under test are:

  - For ``provider="volcengine"`` the embedding probe must call
    ``client.embeddings.create(...)`` WITHOUT a ``dimensions`` kwarg
    (Volcano's gateway 400s if it sees one).
  - For ``provider="dashscope"`` with a requested ``dimension`` greater
    than 1024, the probe must clamp to 1024 (DashScope text-embedding-v3
    caps at 1024).
"""

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch

from app.main import app


def _make_mock_openai_client():
    """Build a MagicMock that quacks like AsyncOpenAI for the two probes.

    chat.completions.create() and embeddings.create() are AsyncMocks so we
    can ``await`` them in the endpoint and inspect their call args.
    """
    client = MagicMock()

    chat_response = MagicMock()
    chat_response.model = "mocked-chat-model"
    chat_response.usage = MagicMock(total_tokens=3)
    client.chat = MagicMock()
    client.chat.completions = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=chat_response)

    embed_data = MagicMock()
    # Use a deterministic vector so dimension assertions are stable.
    embed_data.embedding = [0.1] * 1024
    embed_response = MagicMock(data=[embed_data])
    client.embeddings = MagicMock()
    client.embeddings.create = AsyncMock(return_value=embed_response)

    return client


@pytest.mark.asyncio
async def test_volcengine_probe_omits_dimensions_kwarg():
    mock_client = _make_mock_openai_client()
    with patch("app.main.AsyncOpenAI", return_value=mock_client) as openai_ctor:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/test-connectivity",
                json={
                    "chat": {
                        "api_key": "ark-key",
                        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
                        "model": "doubao-1-5-pro-32k-250115",
                        "provider": "volcengine",
                    },
                    "embedding": {
                        "api_key": "ark-key",
                        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
                        "model": "doubao-embedding-text-240715",
                        "dimension": 2560,
                        "provider": "volcengine",
                    },
                },
            )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["chat"]["ok"] is True
    assert body["chat"]["provider"] == "volcengine"
    assert body["embedding"]["ok"] is True
    assert body["embedding"]["provider"] == "volcengine"
    assert body["embedding"]["sent_dimensions_kwarg"] is False

    # Two AsyncOpenAI clients are constructed (chat + embedding), both
    # pointing at the Volcano gateway.
    assert openai_ctor.call_count == 2
    for call in openai_ctor.call_args_list:
        kwargs = call.kwargs
        assert kwargs["api_key"] == "ark-key"
        assert kwargs["base_url"] == "https://ark.cn-beijing.volces.com/api/v3"

    # The critical assertion: embeddings.create was called WITHOUT `dimensions`.
    assert mock_client.embeddings.create.call_count == 1
    embed_call_kwargs = mock_client.embeddings.create.call_args.kwargs
    assert "dimensions" not in embed_call_kwargs, (
        f"Volcano probe must not send `dimensions`, got: {embed_call_kwargs}"
    )
    assert embed_call_kwargs["model"] == "doubao-embedding-text-240715"
    assert embed_call_kwargs["input"] == "test"


@pytest.mark.asyncio
async def test_dashscope_probe_clamps_dimension_to_1024():
    mock_client = _make_mock_openai_client()
    with patch("app.main.AsyncOpenAI", return_value=mock_client):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/test-connectivity",
                json={
                    "chat": {
                        "api_key": "ds-key",
                        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                        "model": "qwen-plus",
                        "provider": "dashscope",
                    },
                    "embedding": {
                        "api_key": "ds-key",
                        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                        "model": "text-embedding-v3",
                        "dimension": 4096,
                        "provider": "dashscope",
                    },
                },
            )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["chat"]["provider"] == "dashscope"
    assert body["embedding"]["provider"] == "dashscope"
    assert body["embedding"]["sent_dimensions_kwarg"] is True

    embed_call_kwargs = mock_client.embeddings.create.call_args.kwargs
    assert embed_call_kwargs["model"] == "text-embedding-v3"
    assert embed_call_kwargs["dimensions"] == 1024, (
        "DashScope text-embedding-v3 caps at 1024; the probe must clamp the "
        f"requested dimension. got: {embed_call_kwargs}"
    )


@pytest.mark.asyncio
async def test_detect_provider_from_base_url_when_no_provider_field():
    """Backward-compat: pre-existing callers that don't pass `provider`
    should still get the right behaviour via base_url substring detection."""
    mock_client = _make_mock_openai_client()
    with patch("app.main.AsyncOpenAI", return_value=mock_client):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/test-connectivity",
                json={
                    "chat": {
                        "api_key": "ark",
                        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
                        "model": "doubao-pro-32k",
                    },
                    "embedding": {
                        "api_key": "ark",
                        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
                        "model": "doubao-embedding-text-240715",
                        "dimension": 2560,
                    },
                },
            )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["chat"]["provider"] == "volcengine"
    assert body["embedding"]["provider"] == "volcengine"
    embed_call_kwargs = mock_client.embeddings.create.call_args.kwargs
    assert "dimensions" not in embed_call_kwargs


@pytest.mark.asyncio
async def test_openai_probe_keeps_dimensions_kwarg_backcompat():
    """Existing OpenAI callers must keep working: dimensions is still sent."""
    mock_client = _make_mock_openai_client()
    with patch("app.main.AsyncOpenAI", return_value=mock_client):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/test-connectivity",
                json={
                    "chat": {
                        "api_key": "sk-x",
                        "base_url": "https://api.openai.com/v1",
                        "model": "gpt-4o-mini",
                        "provider": "openai",
                    },
                    "embedding": {
                        "api_key": "sk-x",
                        "base_url": "https://api.openai.com/v1",
                        "model": "text-embedding-3-small",
                        "dimension": 1536,
                        "provider": "openai",
                    },
                },
            )

    assert resp.status_code == 200, resp.text
    embed_call_kwargs = mock_client.embeddings.create.call_args.kwargs
    assert embed_call_kwargs.get("dimensions") == 1536


@pytest.mark.asyncio
async def test_llm_providers_listing_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/llm-providers")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    ids = {p["id"] for p in body["providers"]}
    assert {"openai", "dashscope", "volcengine", "ollama", "custom"}.issubset(ids)

    by_id = {p["id"]: p for p in body["providers"]}
    assert by_id["dashscope"]["embed_supports_dimensions"] is True
    assert by_id["dashscope"]["embed_native_dim"] == 1024
    assert by_id["volcengine"]["embed_supports_dimensions"] is False
    assert by_id["volcengine"]["embed_native_dim"] == 2560
    # No env-var aliases leaked to the public payload.
    for p in body["providers"]:
        assert "api_key_env_aliases" not in p
