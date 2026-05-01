"""initial: all 8 tables

Revision ID: 001
Revises: None
Create Date: 2026-05-01
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "knowledge_docs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("manufacturer", sa.String(64), nullable=False),
        sa.Column("category_tags", sa.JSON, server_default="[]"),
        sa.Column("chunk_count", sa.Integer, server_default="0"),
        sa.Column("uploaded_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), server_default="Untitled"),
        sa.Column("status", sa.String(32), server_default="draft"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    op.create_table(
        "requirements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), unique=True, nullable=False),
        sa.Column("machine_type", sa.String(128)),
        sa.Column("safety_level", sa.String(16)),
        sa.Column("environment", sa.String(64)),
        sa.Column("plc_family", sa.String(64)),
        sa.Column("raw_text", sa.Text),
    )

    op.create_table(
        "bom_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("manufacturer", sa.String(64), nullable=False),
        sa.Column("model", sa.String(128), nullable=False),
        sa.Column("quantity", sa.Integer, server_default="1"),
        sa.Column("specifications", sa.JSON, server_default="{}"),
        sa.Column("confidence", sa.String(16)),
        sa.Column("source_chunk_id", sa.String(36)),
        sa.Column("alternatives", sa.JSON, server_default="[]"),
    )

    op.create_table(
        "schematics",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), unique=True, nullable=False),
        sa.Column("mermaid_code", sa.Text, nullable=False),
        sa.Column("svg_data", sa.Text),
    )

    op.create_table(
        "st_modules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("module_type", sa.String(16), nullable=False),
        sa.Column("code", sa.Text, nullable=False),
        sa.Column("sort_order", sa.Integer, server_default="0"),
    )

    op.create_table(
        "io_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("requirement_id", sa.String(36), sa.ForeignKey("requirements.id"), nullable=False),
        sa.Column("tag", sa.String(64), nullable=False),
        sa.Column("io_type", sa.String(4), nullable=False),
        sa.Column("description", sa.String(255)),
    )

    op.create_table(
        "logic_rules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("requirement_id", sa.String(36), sa.ForeignKey("requirements.id"), nullable=False),
        sa.Column("description", sa.Text),
    )


def downgrade() -> None:
    op.drop_table("logic_rules")
    op.drop_table("io_items")
    op.drop_table("st_modules")
    op.drop_table("schematics")
    op.drop_table("bom_items")
    op.drop_table("requirements")
    op.drop_table("projects")
    op.drop_table("knowledge_docs")
