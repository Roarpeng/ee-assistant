# Knowledge Base Multi-Source Ingestion Design

**Date**: 2026-05-09  
**Status**: Implementing  
**Owner**: ee-assistant

## Problem

Knowledge base today only ingests `.pdf` (PyMuPDF). Real engineering corpora
also live as `.txt` notes, `.md` design memos, scraped product `.html`,
`.docx` proposals, and live web URLs (datasheet pages, vendor wikis,
forum posts). Forcing every source through "convert to PDF first" is
friction the user repeatedly hits.

## Goals (in scope)

- Ingest **5 file types** from upload: `pdf`, `txt`, `md`/`markdown`,
  `html`/`htm`, `docx`.
- Ingest **single URLs**: input a URL, server fetches it, dispatches by
  the response's `Content-Type` to the matching extractor.
- Reuse the existing chunk → embed → graph-extract pipeline unchanged
  — only the **first hop** (bytes → text) gains polymorphism.
- Preserve raw bytes in MinIO so the existing **retry** path keeps working
  for every source type, including URLs (we cache the fetched bytes).
- DB tracks **source_type** and (for URLs) **source_url** so the UI can
  badge documents and the backup/restore bundle round-trips them.

## Non-goals

- No site-level crawling, no JS rendering, no headless browser. URL
  ingestion = single HTTP GET.
- No legacy `.doc` (binary Word) — would need LibreOffice/antiword in the
  image, +400-800MB. `.docx` only.
- No OCR for scanned PDFs (already documented as unsupported).
- No automatic format conversion (we don't render HTML → PDF, etc.).

## Architecture

### Layered extraction

A new module `backend/app/core/extractors.py` defines a uniform contract:

```python
def extract_text(content: bytes, *, filename: str, mime: str | None = None) -> str
```

…that dispatches to one of:

| Suffix              | MIME (heuristic)                               | Implementation             |
|---------------------|------------------------------------------------|----------------------------|
| `.pdf`              | `application/pdf`                              | PyMuPDF (existing)         |
| `.txt`              | `text/plain`                                   | `charset-normalizer` decode |
| `.md`, `.markdown`  | `text/markdown`                                | `charset-normalizer` decode |
| `.html`, `.htm`     | `text/html`, `application/xhtml+xml`           | BeautifulSoup (`lxml`), strip script/style/nav, take `body` text |
| `.docx`             | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `python-docx`: paragraphs + tables |

Dispatch order: explicit `mime` (if given by HTTP server) → suffix →
fallback "best guess" by sniffing magic bytes (PDF starts with `%PDF`,
DOCX is a zip starting with `PK`). Failure raises a typed
`UnsupportedSourceError("...")` that the API converts to **HTTP 415**.

### URL ingestion

`backend/app/core/url_fetcher.py` exports:

```python
async def fetch_url(url: str, *, max_bytes: int = 800 * 1024 * 1024) -> tuple[bytes, str, str]
    """Returns (content, mime, derived_filename). Raises on non-2xx,
    redirect loops, or oversized responses."""
```

Implementation uses the existing `httpx.AsyncClient` config (proxy-aware),
follows up to 5 redirects, hard-caps at the same 800MB ceiling that
matches nginx, and derives a filename from `Content-Disposition` →
URL path → `index.html`.

### API surface

Two endpoints, both returning the same `KnowledgeDocOut`:

| Method | Path                        | Body                                             | Notes                          |
|--------|-----------------------------|--------------------------------------------------|--------------------------------|
| POST   | `/api/knowledge/docs`       | multipart: file + manufacturer + …               | Existing endpoint, broadened   |
| POST   | `/api/knowledge/urls`       | JSON `{url, manufacturer, category_tags?, llm_config?, embedding_config?}` | New                            |

The URL endpoint:

1. Calls `fetch_url()`.
2. Stores bytes in MinIO at `pdfs/{doc_id}/{derived_filename}`
   (path prefix kept for backward compatibility — see Migration).
3. Records `source_type` + `source_url` in DB.
4. Schedules the same `_process_document(...)` background task.

### DB schema

Migration `2026_05_09_multi_source.py`:

```sql
ALTER TABLE knowledge_docs ADD COLUMN source_type VARCHAR(16) NOT NULL DEFAULT 'pdf';
ALTER TABLE knowledge_docs ADD COLUMN source_url  VARCHAR(2048);
```

`source_type ∈ {'pdf','txt','md','html','docx','url'}`. The
`'url'` value is set when the document originated from `/urls`; the
**effective** parsed type after fetch is captured in the filename suffix
so retry can re-dispatch.

### Retry semantics

`POST /api/knowledge/docs/{id}/retry` is unchanged externally. Internally
it now re-dispatches by suffix using the cached MinIO bytes — no special
casing needed because the new pipeline is filename-driven from the start.

### MinIO path

We keep the legacy `pdfs/` prefix even for non-PDF content. Reasons:

- Existing backup/restore scripts (`scripts/backup_knowledge.{sh,ps1}`)
  hard-code that prefix; renaming would split bundles between two
  prefixes and break restore-old-bundle interop.
- Bucket-internal layout is invisible to users.
- A code comment + this design doc make the historical naming explicit.

### Frontend

- `accept` attribute broadened: `.pdf,.txt,.md,.markdown,.html,.htm,.docx`.
- `isPdfFile()` becomes `isSupportedFile()` with the same whitelist.
- A new compact **URL input row** beneath the dropzone:
  `[ https://… ]  [Add URL]`. Submitting calls `/api/knowledge/urls` and
  feeds the resulting doc into the same docs list with the same WS
  progress subscription.
- Document row gets a small `source_type` badge (text only, no icons).
- `MAX_UPLOAD_BYTES` constant unchanged (800 MiB), still matches nginx.

## Risks & mitigations

| Risk                                                 | Mitigation                                            |
|------------------------------------------------------|-------------------------------------------------------|
| HTML pages with massive nav/footer noise             | BeautifulSoup keeps `body` text only, strips `script`/`style`/`nav`/`header`/`footer`/`aside` |
| Text encodings (GBK Chinese docs)                    | `charset-normalizer` auto-detects; UTF-8 fallback     |
| `python-docx` chokes on `.doc`                       | Suffix gate rejects `.doc` with 415 + explicit message |
| URL fetch blocked by corporate proxy                 | Reuse same httpx client config that LLM calls use (proxy-aware) |
| URL points to a 5GB ISO                              | `max_bytes` ceiling (800MB) with streaming download   |
| Same URL ingested twice                              | No dedup in v1; UI shows two entries; future: hash-based dedup |
| `python-docx` ignores headers/footers/comments       | Acceptable for v1; product manuals rarely use them    |

## Test plan

Unit tests in `backend/tests/test_extractors.py`:

- `test_extract_pdf_basic` — feeds a tiny generated PDF, asserts text round-trip
- `test_extract_txt_utf8` and `test_extract_txt_gbk`
- `test_extract_md_keeps_content` — markdown is treated as plain text
- `test_extract_html_strips_chrome` — script/style/nav removed
- `test_extract_docx_paragraphs_and_tables`
- `test_dispatch_unknown_suffix_raises`
- `test_url_fetcher_oversized_aborts` (mock httpx)
- `test_url_fetcher_html_path` (mock httpx)

Integration smoke after deploy:

- Upload one .txt, one .md, one .html, one .docx via the UI; all reach
  `ready` status.
- Submit a URL pointing at a public datasheet page; it appears in the
  list with `source_type: url` and reaches `ready`.

## Out-of-band follow-ups

- Hash-based URL dedup
- Optional readability extraction (e.g. `trafilatura`) for noisy news
  pages — install only if real-world quality complaints surface
- `source_type` exported in the bundle manifest so backup/restore round-trips it
