"""optional trigram indexes for lexical search

Revision ID: 009_search_trgm
Revises: 008_project_title_tags
Create Date: 2026-08-04

Performance-only migration for the unified-search lexical channels:
pg_trgm GIN indexes make ``ILIKE '%mlfb%'`` over component names and
project names index-backed on PostgreSQL.

Reliability contract (industrial-first):
* No-op on non-PostgreSQL dialects (SQLite dev/test DBs).
* Each statement runs in a SAVEPOINT; any failure (extension not
  allowed, permission denied) is logged and swallowed — the migration
  must never block a deployment for a performance nicety.
* Fully idempotent (IF NOT EXISTS everywhere).
"""
from __future__ import annotations

import logging
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

log = logging.getLogger("alembic.009_search_trgm")

revision: str = "009_search_trgm"
down_revision: Union[str, Sequence[str], None] = "008_project_title_tags"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_STATEMENTS = (
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    (
        "CREATE INDEX IF NOT EXISTS ix_component_nodes_name_trgm "
        "ON component_nodes USING gin (name gin_trgm_ops)"
    ),
    (
        "CREATE INDEX IF NOT EXISTS ix_projects_name_trgm "
        "ON projects USING gin (name gin_trgm_ops)"
    ),
)


def _guarded_execute(bind, stmt: str) -> None:
    """Run one DDL statement inside a SAVEPOINT; log-and-continue on failure."""
    try:
        with bind.begin_nested():
            bind.execute(text(stmt))
    except Exception as e:  # pragma: no cover - env-dependent
        log.warning("009_search_trgm skipped '%s': %s", stmt.split("\n")[0], e)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # SQLite dev/test environments: ILIKE works without indexes.
        return
    for stmt in _STATEMENTS:
        _guarded_execute(bind, stmt)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for stmt in (
        "DROP INDEX IF EXISTS ix_projects_name_trgm",
        "DROP INDEX IF EXISTS ix_component_nodes_name_trgm",
        # Intentionally NOT dropping the pg_trgm extension: other
        # features/migrations may rely on it; extensions outlive indexes.
    ):
        _guarded_execute(bind, stmt)
