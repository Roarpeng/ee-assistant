"""project_topologies table (topology as single source of truth)

Revision ID: 010_project_topologies
Revises: 009_search_trgm
Create Date: 2026-05-26

``project_topologies`` had been created only by the lifespan
``Base.metadata.create_all`` shortcut; a deployment that followed the
documented ``alembic upgrade head`` path got a DB without it and the
topology APIs failed at runtime. This migration closes that gap so the
model ↔ migration contract matches ``app.db.models.ProjectTopology``
exactly (guarded by ``tests/test_alembic_schema_sync.py``).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "010_project_topologies"
down_revision: Union[str, Sequence[str], None] = "009_search_trgm"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_topologies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer, server_default="1"),
        sa.Column("status", sa.String(32), server_default="draft"),
        sa.Column("source", sa.String(32), server_default="user"),
        sa.Column("snapshot", sa.JSON, server_default="{}"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("confirmed_at", sa.DateTime, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("project_topologies")
