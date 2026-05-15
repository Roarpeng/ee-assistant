"""Unit tests for the per-format text extractors and the dispatch layer."""
from __future__ import annotations

import io
import zipfile

import pytest

from app.core.extractors import (
    ExtractionError,
    UnsupportedSourceError,
    derive_filename_from_mime,
    detect_source_type,
    extract_text,
    normalize_suffix,
)


# ---------------------------------------------------------------------------
# Plain text & markdown
# ---------------------------------------------------------------------------


def test_extract_txt_utf8():
    text = "电气工程师助手 hello world\n第二行"
    out = extract_text(text.encode("utf-8"), filename="notes.txt")
    assert "电气工程师助手" in out
    assert "第二行" in out


def test_extract_txt_utf8_bom():
    text = "héllo BOM"
    out = extract_text(b"\xef\xbb\xbf" + text.encode("utf-8"), filename="bom.txt")
    assert out.startswith("héllo")
    assert "\ufeff" not in out


def test_extract_txt_gbk_decodes_legacy_chinese_manual():
    # Realistic snippet from a legacy GB-encoded product manual.
    # The decoder must succeed without garbling — this is the actual
    # production scenario users hit when they upload old datasheets.
    text = (
        "电气工程师助手 是一个面向工业自动化领域的辅助工具。\n"
        "本产品适用于交流 220V/380V 控制系统，最大输出电流 10A，\n"
        "支持 PROFINET 与 Modbus TCP 双协议通讯，工作温度 -20°C ~ 60°C。\n"
        "断路器额定电流必须不小于负载总电流的 1.25 倍。"
    )
    raw = text.encode("gb18030")
    out = extract_text(raw, filename="legacy.txt")
    assert "电气工程师助手" in out
    assert "PROFINET" in out
    assert "断路器" in out


def test_extract_md_keeps_syntax():
    md = "# Title\n\nSome **bold** text and a [link](https://x)."
    out = extract_text(md.encode("utf-8"), filename="memo.md")
    # We deliberately preserve markdown syntax — embeddings work fine on it
    # and headers carry useful section signal.
    assert "# Title" in out
    assert "**bold**" in out


def test_extract_markdown_alias_suffix():
    out = extract_text(b"# x", filename="readme.markdown")
    assert "# x" in out


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------


def test_extract_html_strips_chrome_and_keeps_body():
    html = b"""<!doctype html>
<html><head>
  <title>Should be hidden</title>
  <style>body { color: red }</style>
  <script>alert('nope')</script>
</head>
<body>
  <nav>Home | Products | Contact</nav>
  <header>Top banner</header>
  <main>
    <h1>Datasheet 3RV2021</h1>
    <p>Rated current 10A.</p>
  </main>
  <footer>Copyright 2026</footer>
</body></html>"""
    out = extract_text(html, filename="page.html")
    assert "Datasheet 3RV2021" in out
    assert "Rated current 10A" in out
    # All noise tags purged.
    assert "alert" not in out
    assert "Home | Products | Contact" not in out
    assert "Top banner" not in out
    assert "Copyright 2026" not in out


def test_extract_html_alias_htm():
    out = extract_text(b"<html><body><p>hi</p></body></html>", filename="x.htm")
    assert "hi" in out


def test_extract_html_empty_body_raises():
    # Pure chrome with no real body content should look empty after stripping.
    html = b"<html><head></head><body><script>x</script></body></html>"
    with pytest.raises(ExtractionError):
        extract_text(html, filename="empty.html")


# ---------------------------------------------------------------------------
# DOCX (synthesized inline so the test has no fixture file dependency)
# ---------------------------------------------------------------------------


def _build_minimal_docx(paragraphs: list[str]) -> bytes:
    """Construct the smallest valid .docx that python-docx can read.

    A .docx is just a zip with a `[Content_Types].xml`, a relationships
    file, and a `word/document.xml`. Building it inline avoids checking
    a binary fixture into the repo.
    """
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '</Types>'
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/></Relationships>'
    )
    paras_xml = "".join(
        f'<w:p><w:r><w:t xml:space="preserve">{p}</w:t></w:r></w:p>' for p in paragraphs
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:body>{paras_xml}</w:body></w:document>'
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document)
    return buf.getvalue()


def test_extract_docx_paragraphs():
    docx_bytes = _build_minimal_docx(["First paragraph 第一段", "Second paragraph 第二段"])
    out = extract_text(docx_bytes, filename="report.docx")
    assert "First paragraph" in out
    assert "第二段" in out


# ---------------------------------------------------------------------------
# Dispatch layer
# ---------------------------------------------------------------------------


def test_dispatch_unknown_suffix_raises_unsupported():
    with pytest.raises(UnsupportedSourceError):
        extract_text(b"x", filename="evil.exe")


def test_dispatch_falls_back_to_mime_when_suffix_unknown():
    # No useful suffix, but a valid MIME — should still resolve.
    out = extract_text(b"hello text", filename="resource", mime="text/plain")
    assert out == "hello text"


def test_detect_source_type_pdf():
    assert detect_source_type("manual.pdf") == "pdf"


def test_detect_source_type_md_alias():
    assert detect_source_type("readme.markdown") == "md"


def test_detect_source_type_via_mime():
    assert detect_source_type("noext", mime="application/pdf") == "pdf"


def test_detect_source_type_unknown_raises():
    with pytest.raises(UnsupportedSourceError):
        detect_source_type("file.xyz")


def test_normalize_suffix_lowercase():
    assert normalize_suffix("MANUAL.PDF") == ".pdf"
    assert normalize_suffix("noext") == ""


def test_derive_filename_from_mime_fallbacks():
    assert derive_filename_from_mime("application/pdf").endswith(".pdf")
    assert derive_filename_from_mime("text/html").endswith(".html")
    # Unknown mime defaults to .html (safest for arbitrary URLs).
    assert derive_filename_from_mime(None).endswith(".html")
