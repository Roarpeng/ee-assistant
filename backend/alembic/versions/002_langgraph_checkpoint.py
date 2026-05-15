"""langgraph checkpoint tables (managed by PostgresSaver.setup())

LangGraph's PostgresSaver creates its own checkpoint / writes / blobs
tables via `setup()` on first use. We do NOT define them here — this
migration only fixes the revision chain so downstream migrations
have a stable down_revision.

NOTE on revision chain: the actual current alembic head at the time
of this migration is "003" (knowledge_docs.source_type/source_url),
not "001_initial_tables" as the original plan assumed. We chain off
"003" so this migration is appendable to the real history. Track B
should still chain off "002_langgraph_checkpoint".

Revision ID: 002_langgraph_checkpoint
Revises: 003
"""
from alembic import op  # noqa: F401

revision = "002_langgraph_checkpoint"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
