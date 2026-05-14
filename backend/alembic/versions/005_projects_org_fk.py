"""projects.org_id FK (additive, NULL-able for back-compat)

Revision ID: 005_projects_org_fk
Revises: 004_organizations
"""
import sqlalchemy as sa
from alembic import op

revision = "005_projects_org_fk"
down_revision = "004_organizations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("org_id", sa.String(36), nullable=True, index=True))
    op.create_foreign_key(
        "fk_projects_org",
        "projects",
        "organizations",
        ["org_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_projects_org", "projects", type_="foreignkey")
    op.drop_column("projects", "org_id")
