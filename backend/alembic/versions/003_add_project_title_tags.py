"""add title and topic_tags to projects

Revision ID: 003
Revises: 002
Create Date: 2026-05-05 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '003'
down_revision: Union[str, Sequence[str], None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('title', sa.String(length=200), nullable=True))
    op.add_column('projects', sa.Column('topic_tags', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'topic_tags')
    op.drop_column('projects', 'title')
