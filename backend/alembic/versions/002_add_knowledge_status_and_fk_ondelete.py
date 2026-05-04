"""add knowledge_docs.status + ondelete SET NULL for component FKs

Revision ID: 002
Revises: a4d5b3e39d74
Create Date: 2026-05-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '002'
down_revision: Union[str, Sequence[str], None] = 'a4d5b3e39d74'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add status column with default "ready" for existing documents
    op.add_column(
        'knowledge_docs',
        sa.Column('status', sa.String(length=32), nullable=False, server_default='ready')
    )

    # Drop existing FK constraints and re-create with ON DELETE SET NULL
    # Use dynamic constraint name lookup (PostgreSQL)
    op.execute("""
        DO $$
        DECLARE
            cn_name text;
            ce_name text;
        BEGIN
            SELECT conname INTO cn_name
            FROM pg_constraint
            WHERE conrelid = 'component_nodes'::regclass
              AND confrelid = 'knowledge_docs'::regclass;

            SELECT conname INTO ce_name
            FROM pg_constraint
            WHERE conrelid = 'component_edges'::regclass
              AND confrelid = 'knowledge_docs'::regclass;

            IF cn_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE component_nodes DROP CONSTRAINT %I', cn_name);
                EXECUTE format(
                    'ALTER TABLE component_nodes ADD CONSTRAINT %I FOREIGN KEY (source_doc_id) REFERENCES knowledge_docs(id) ON DELETE SET NULL',
                    cn_name
                );
            END IF;

            IF ce_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE component_edges DROP CONSTRAINT %I', ce_name);
                EXECUTE format(
                    'ALTER TABLE component_edges ADD CONSTRAINT %I FOREIGN KEY (source_doc_id) REFERENCES knowledge_docs(id) ON DELETE SET NULL',
                    ce_name
                );
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # Drop and re-create FK constraints without ON DELETE
    op.execute("""
        DO $$
        DECLARE
            cn_name text;
            ce_name text;
        BEGIN
            SELECT conname INTO cn_name
            FROM pg_constraint
            WHERE conrelid = 'component_nodes'::regclass
              AND confrelid = 'knowledge_docs'::regclass;

            SELECT conname INTO ce_name
            FROM pg_constraint
            WHERE conrelid = 'component_edges'::regclass
              AND confrelid = 'knowledge_docs'::regclass;

            IF cn_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE component_nodes DROP CONSTRAINT %I', cn_name);
                EXECUTE format(
                    'ALTER TABLE component_nodes ADD CONSTRAINT %I FOREIGN KEY (source_doc_id) REFERENCES knowledge_docs(id)',
                    cn_name
                );
            END IF;

            IF ce_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE component_edges DROP CONSTRAINT %I', ce_name);
                EXECUTE format(
                    'ALTER TABLE component_edges ADD CONSTRAINT %I FOREIGN KEY (source_doc_id) REFERENCES knowledge_docs(id)',
                    ce_name
                );
            END IF;
        END $$;
    """)

    # Remove status column
    op.drop_column('knowledge_docs', 'status')
