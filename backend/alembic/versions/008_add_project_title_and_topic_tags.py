"""add projects.title + projects.topic_tags for conversation workspace

Revision ID: 008_project_title_tags
Revises: 007_episodic_and_reports
Create Date: 2026-05-15 10:00:00.000000

This migration was originally drafted on the cursorCode branch as ``004``,
but has been renumbered ``008`` so it can chain after the blueprint memory-
flywheel migrations (002_langgraph_checkpoint → 003_chat_messages →
004_organizations → 005_projects_org_fk → 006_decisions_runhistory_weights
→ 007_episodic_memories_and_reports).

Both columns have safe defaults so existing rows (including legacy projects
created before alembic was introduced) survive without backfill.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '008_project_title_tags'
down_revision: Union[str, Sequence[str], None] = '007_episodic_and_reports'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'projects',
        sa.Column('title', sa.String(length=255), nullable=True),
    )
    op.add_column(
        'projects',
        sa.Column(
            'topic_tags',
            sa.JSON(),
            nullable=False,
            server_default='[]',
        ),
    )


def downgrade() -> None:
    op.drop_column('projects', 'topic_tags')
    op.drop_column('projects', 'title')
