"""episodic_memories + weekly_memory_reports tables (M3 Track A)

Revision ID: 007_episodic_and_reports
Revises: 006_decisions_runhistory_weights

Both tables ship in one migration per the M3 plan — they are
conceptually paired (L3 capture + L4 consolidation) and we want to
avoid an extra revision chain link for what is one logical change.

(Filename keeps the plan's preassigned ``007_episodic_memories_and_reports``
name; the in-file ``revision`` string is shortened to 24 chars to fit
the existing ``alembic_version.version_num`` ``varchar(32)`` column —
``007_episodic_memories_and_reports`` is 33 chars and overflows.)
"""
import sqlalchemy as sa
from alembic import op

revision = "007_episodic_and_reports"
down_revision = "006_decisions_runhistory_weights"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "episodic_memories",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "org_id",
            sa.String(36),
            sa.ForeignKey("organizations.id"),
            nullable=True,
            index=True,
        ),
        sa.Column("requirement_snapshot", sa.JSON, nullable=False),
        sa.Column("bom_snapshot", sa.JSON, nullable=False),
        sa.Column("key_decisions", sa.JSON, nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("embedding_id", sa.String(64), nullable=True),
        sa.Column("score", sa.Float, nullable=False, server_default="0.5"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            index=True,
        ),
    )

    op.create_table(
        "weekly_memory_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "org_id",
            sa.String(36),
            sa.ForeignKey("organizations.id"),
            nullable=True,
            index=True,
        ),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("new_rules", sa.JSON, nullable=False),
        sa.Column("revisions", sa.JSON, nullable=False),
        sa.Column("gaps", sa.JSON, nullable=False),
        sa.Column("metrics", sa.JSON, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            index=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("weekly_memory_reports")
    op.drop_table("episodic_memories")
