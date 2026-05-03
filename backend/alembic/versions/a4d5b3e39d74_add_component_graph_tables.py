"""add component graph tables

Revision ID: a4d5b3e39d74
Revises: 001
Create Date: 2026-05-03 13:00:26.151471

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4d5b3e39d74'
down_revision: Union[str, Sequence[str], None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('component_nodes',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('component_type', sa.String(length=64), nullable=False),
    sa.Column('properties', sa.JSON(), nullable=False),
    sa.Column('community', sa.String(length=64), nullable=True),
    sa.Column('source_doc_id', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['source_doc_id'], ['knowledge_docs.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('component_edges',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('source_id', sa.String(length=36), nullable=False),
    sa.Column('target_id', sa.String(length=36), nullable=False),
    sa.Column('relation', sa.String(length=32), nullable=False),
    sa.Column('properties', sa.JSON(), nullable=False),
    sa.Column('confidence', sa.String(length=16), nullable=False),
    sa.Column('source_doc_id', sa.String(length=36), nullable=True),
    sa.ForeignKeyConstraint(['source_doc_id'], ['knowledge_docs.id'], ),
    sa.ForeignKeyConstraint(['source_id'], ['component_nodes.id'], ),
    sa.ForeignKeyConstraint(['target_id'], ['component_nodes.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('component_edges')
    op.drop_table('component_nodes')
