"""Circuit-level schematic generation package.

Deterministic-first (design doc docs/superpowers/specs/2026-10-03-schematic-generator-design.md):
topology/BOM/wiring → Schematic IR → validated → SVG pages. The LLM never
decides connectivity — it only reviews/annotates (see graph node
`schematic_reviewer`).
"""
from app.core.schematic.builder import TagRegistry, build_schematic
from app.core.schematic.ir import (
    SchematicBuildError,
    SchematicDocument,
    SchematicPage,
    validate_schematic_ir,
)
from app.core.schematic.svg_render import render_document, render_page

__all__ = [
    "TagRegistry",
    "build_schematic",
    "validate_schematic_ir",
    "render_page",
    "render_document",
    "SchematicDocument",
    "SchematicPage",
    "SchematicBuildError",
]
