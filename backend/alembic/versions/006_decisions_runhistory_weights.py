"""decisions + run_history + selection_weights tables (M2 Track A)

Revision ID: 006_decisions_runhistory_weights
Revises: 005_projects_org_fk
"""
import sqlalchemy as sa
from alembic import op

revision = "006_decisions_runhistory_weights"
down_revision = "005_projects_org_fk"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "decisions",
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
        sa.Column("type", sa.String(32), nullable=False, index=True),
        sa.Column("context", sa.JSON, nullable=False),
        sa.Column("before", sa.JSON, nullable=True),
        sa.Column("after", sa.JSON, nullable=True),
        sa.Column("rationale", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            index=True,
        ),
    )

    op.create_table(
        "run_history",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("nodes_executed", sa.JSON, nullable=False),
        sa.Column("errors", sa.JSON, nullable=False),
        sa.Column("final_stage", sa.String(64), nullable=True),
    )

    op.create_table(
        "selection_weights",
        sa.Column(
            "org_id",
            sa.String(36),
            sa.ForeignKey("organizations.id"),
            primary_key=True,
            nullable=True,
        ),
        sa.Column("category", sa.String(64), primary_key=True),
        sa.Column("manufacturer", sa.String(120), primary_key=True),
        sa.Column("model", sa.String(120), primary_key=True),
        sa.Column("weight", sa.Float, nullable=False, server_default="0.0"),
        sa.Column(
            "last_selected_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("selection_weights")
    op.drop_table("run_history")
    op.drop_table("decisions")
