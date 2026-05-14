"""chat_messages table

Revision ID: 003_chat_messages
Revises: 002_langgraph_checkpoint
"""
import sqlalchemy as sa
from alembic import op

revision = "003_chat_messages"
down_revision = "002_langgraph_checkpoint"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("options", sa.JSON, nullable=True),
        sa.Column("sequence", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_chat_messages_project_seq", "chat_messages", ["project_id", "sequence"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_project_seq", table_name="chat_messages")
    op.drop_table("chat_messages")
