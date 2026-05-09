"""Tests for the URL ingestion fetcher.

We mock httpx with the recommended `MockTransport` so we can drive both
streamed bodies and oversized responses without ever touching the network.
"""
from __future__ import annotations

import httpx
import pytest

from app.core import url_fetcher
from app.core.url_fetcher import URLFetchError, fetch_url


def _make_client_factory(handler):
    """Patch the httpx.AsyncClient inside url_fetcher so each call uses a
    MockTransport with the supplied handler. Returns nothing — the patch
    is applied via monkeypatch in the calling test.
    """
    transport = httpx.MockTransport(handler)
    real_client_cls = httpx.AsyncClient

    class _PatchedClient(real_client_cls):  # type: ignore[misc, valid-type]
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    return _PatchedClient


@pytest.mark.asyncio
async def test_fetch_url_html_returns_bytes_and_filename(monkeypatch):
    body = b"<html><body><p>hi</p></body></html>"

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        return httpx.Response(
            200,
            headers={"content-type": "text/html; charset=utf-8"},
            content=body,
        )

    monkeypatch.setattr(url_fetcher.httpx, "AsyncClient", _make_client_factory(handler))

    content, mime, filename = await fetch_url("https://example.com/x")
    assert content == body
    assert mime.startswith("text/html")
    assert filename.endswith(".html") or filename == "x"


@pytest.mark.asyncio
async def test_fetch_url_pdf_via_content_disposition(monkeypatch):
    body = b"%PDF-1.4 fake"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={
                "content-type": "application/pdf",
                "content-disposition": 'attachment; filename="datasheet.pdf"',
            },
            content=body,
        )

    monkeypatch.setattr(url_fetcher.httpx, "AsyncClient", _make_client_factory(handler))

    content, mime, filename = await fetch_url("https://example.com/files?id=42")
    assert content == body
    assert mime == "application/pdf"
    assert filename == "datasheet.pdf"


@pytest.mark.asyncio
async def test_fetch_url_oversized_aborts(monkeypatch):
    # Server lies about Content-Length being small but actually streams
    # 10kB; our cap is 1kB. We should abort during streaming, not after.
    big = b"x" * 10_000

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=big, headers={"content-type": "text/plain"})

    monkeypatch.setattr(url_fetcher.httpx, "AsyncClient", _make_client_factory(handler))

    with pytest.raises(URLFetchError, match="exceeds"):
        await fetch_url("https://example.com/big.txt", max_bytes=1_000)


@pytest.mark.asyncio
async def test_fetch_url_declared_oversized_aborts_early(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={
                "content-type": "application/pdf",
                "content-length": str(2 * 1024 * 1024 * 1024),  # 2GB
            },
            content=b"",
        )

    monkeypatch.setattr(url_fetcher.httpx, "AsyncClient", _make_client_factory(handler))

    with pytest.raises(URLFetchError, match="exceeds"):
        await fetch_url("https://example.com/huge.pdf", max_bytes=1024 * 1024)


@pytest.mark.asyncio
async def test_fetch_url_404_raises(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, content=b"nope")

    monkeypatch.setattr(url_fetcher.httpx, "AsyncClient", _make_client_factory(handler))

    with pytest.raises(URLFetchError, match="HTTP 404"):
        await fetch_url("https://example.com/missing")


@pytest.mark.asyncio
async def test_fetch_url_rejects_bad_scheme():
    with pytest.raises(URLFetchError, match="scheme"):
        await fetch_url("file:///etc/passwd")


@pytest.mark.asyncio
async def test_fetch_url_rejects_empty():
    with pytest.raises(URLFetchError):
        await fetch_url("")


@pytest.mark.asyncio
async def test_fetch_url_filename_falls_back_to_mime(monkeypatch):
    """URL has no useful path; filename should be MIME-synthesized so the
    extractor dispatch still works."""
    body = b"<html><body>x</body></html>"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "text/html"},
            content=body,
        )

    monkeypatch.setattr(url_fetcher.httpx, "AsyncClient", _make_client_factory(handler))

    _, _, filename = await fetch_url("https://example.com/")
    assert filename.endswith(".html")
