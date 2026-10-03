"""schematic_pages table (circuit-level schematic IR + SVG cache)

Revision ID: 011_schematic_pages
Revises: 010_project_topologies
Create Date: 2026-10-03

Stores the derived multi-page circuit schematics (design doc
docs/superpowers/specs/2026-10-03-schematic-generator-design.md §4.6):
one row per page, JSON IR + rendered SVG, unique per (project, page_no).
Rebuildable at any time from the confirmed topology + BOM.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "011_schematic_pages"
down_revision: Union[str, Sequence[str], None] = "010_project_topologies"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "schematic_pages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("page_no", sa.Integer, nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("title_zh", sa.String(128), server_default=""),
        sa.Column("ir", sa.JSON, server_default="{}"),
        sa.Column("svg", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "project_id", "page_no", name="uq_schematic_pages_project_page"
        ),
    )


def downgrade() -> None:
    op.drop_table("schematic_pages")
