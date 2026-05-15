"""add knowledge_docs.source_type + source_url for multi-source ingestion

Revision ID: 003
Revises: 002
Create Date: 2026-05-09 14:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '003'
down_revision: Union[str, Sequence[str], None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # source_type defaults to 'pdf' so existing rows preserve their type.
    op.add_column(
        'knowledge_docs',
        sa.Column(
            'source_type',
            sa.String(length=16),
            nullable=False,
            server_default='pdf',
        ),
    )
    op.add_column(
        'knowledge_docs',
        sa.Column('source_url', sa.String(length=2048), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('knowledge_docs', 'source_url')
    op.drop_column('knowledge_docs', 'source_type')
