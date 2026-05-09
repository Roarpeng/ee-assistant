"""Single-page URL fetcher for the knowledge ingestion pipeline.

Returns raw bytes plus the metadata the rest of the pipeline needs to
dispatch the right extractor. No JS rendering, no link following — by
design (see the multi-source spec).
"""
from __future__ import annotations

import re
from urllib.parse import unquote, urlparse

import httpx

from .extractors import derive_filename_from_mime, normalize_suffix, SUPPORTED_SUFFIXES


class URLFetchError(ValueError):
    """Raised on any non-2xx response, oversized payload, or network error
    we want surfaced to the user. The API layer renders these as 422.
    """


# Mirrors nginx's /api/ client_max_body_size. If you bump nginx, bump this.
DEFAULT_MAX_BYTES = 800 * 1024 * 1024
DEFAULT_TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)
USER_AGENT = "ee-assistant/1.0 (+knowledge-ingest)"


_FILENAME_HEADER_RE = re.compile(
    r'filename\*?=(?:UTF-8\'\')?"?([^";]+)"?', re.IGNORECASE
)


def _filename_from_disposition(header: str | None) -> str | None:
    if not header:
        return None
    m = _FILENAME_HEADER_RE.search(header)
    if not m:
        return None
    return unquote(m.group(1).strip())


def _filename_from_url(url: str) -> str | None:
    path = urlparse(url).path
    if not path or path.endswith("/"):
        return None
    candidate = path.rsplit("/", 1)[-1]
    return unquote(candidate) or None


def _derive_filename(url: str, content_type: str | None, content_disposition: str | None) -> str:
    """Pick the best filename in priority order:
    1. Content-Disposition header (truth from the server)
    2. URL path tail with a supported suffix
    3. MIME-derived synthetic name (so dispatch still works)
    """
    disp_name = _filename_from_disposition(content_disposition)
    if disp_name and normalize_suffix(disp_name) in SUPPORTED_SUFFIXES:
        return disp_name

    url_name = _filename_from_url(url)
    if url_name and normalize_suffix(url_name) in SUPPORTED_SUFFIXES:
        return url_name

    return derive_filename_from_mime(content_type, fallback="webpage")


async def fetch_url(
    url: str,
    *,
    max_bytes: int = DEFAULT_MAX_BYTES,
    timeout: httpx.Timeout = DEFAULT_TIMEOUT,
) -> tuple[bytes, str, str]:
    """Fetch a single URL.

    Returns ``(content, mime, derived_filename)``.

    - Follows up to 5 redirects.
    - Streams the body and aborts as soon as the running total exceeds
      ``max_bytes`` (so a 10 GB ISO behind a redirect can't OOM us even
      if the server lies in Content-Length).
    - On any non-2xx, network failure, or oversized response, raises
      ``URLFetchError`` with a user-readable message.
    """
    if not url or not url.strip():
        raise URLFetchError("URL must not be empty.")

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise URLFetchError(f"Unsupported URL scheme: {parsed.scheme!r}. Only http/https.")
    if not parsed.netloc:
        raise URLFetchError("URL is missing a host.")

    headers = {
        "User-Agent": USER_AGENT,
        # Ask politely for HTML/text/PDF; servers that respect Accept will
        # send a saner Content-Type back.
        "Accept": (
            "text/html,application/xhtml+xml,application/pdf,"
            "text/plain;q=0.9,*/*;q=0.5"
        ),
    }

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            max_redirects=5,
            timeout=timeout,
            headers=headers,
        ) as client:
            async with client.stream("GET", url) as resp:
                if resp.status_code >= 400:
                    raise URLFetchError(
                        f"Server returned HTTP {resp.status_code} for {url}"
                    )

                content_type = resp.headers.get("content-type", "")
                content_disposition = resp.headers.get("content-disposition")

                # Cheap up-front guard if the server is honest.
                declared_len = resp.headers.get("content-length")
                if declared_len and declared_len.isdigit() and int(declared_len) > max_bytes:
                    raise URLFetchError(
                        f"Resource is {int(declared_len) // (1024 * 1024)} MB, "
                        f"exceeds {max_bytes // (1024 * 1024)} MB limit."
                    )

                buf = bytearray()
                async for chunk in resp.aiter_bytes():
                    buf.extend(chunk)
                    if len(buf) > max_bytes:
                        raise URLFetchError(
                            f"Download aborted: response exceeds "
                            f"{max_bytes // (1024 * 1024)} MB limit."
                        )

                content = bytes(buf)
                # Final URL after redirects gives us a more accurate
                # filename basis than the original.
                final_url = str(resp.url)
                filename = _derive_filename(final_url, content_type, content_disposition)
                return content, content_type, filename

    except httpx.HTTPError as exc:
        raise URLFetchError(f"Network error fetching {url}: {exc}") from exc
