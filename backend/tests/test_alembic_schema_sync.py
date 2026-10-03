"""Guard against model ↔ migration drift.

Runs the real alembic chain (``alembic upgrade head``) against a
throwaway SQLite file and diffs the resulting schema with
``Base.metadata``. Before migration 010, a fresh ``upgrade head`` DB
silently lacked ``project_topologies`` because the lifespan
``create_all`` masked the gap in dev; this test makes that class of
regression impossible.
"""
import asyncio
import os
import sys
import tempfile

import pytest

pytestmark = pytest.mark.asyncio


def _upgrade_head_sync(db_url: str) -> None:
    """Run ``alembic upgrade head`` synchronously (env.py drives its own
    asyncio.run, so this must not run inside an active event loop)."""
    from alembic import command
    from alembic.config import Config

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)

    from app.config import settings

    cfg = Config(os.path.join(backend_dir, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))

    original_url = settings.database_url
    settings.database_url = db_url  # env.py reads settings.database_url
    try:
        command.upgrade(cfg, "head")
    finally:
        settings.database_url = original_url


async def test_alembic_head_covers_all_models() -> None:
    tmp_path = tempfile.mktemp(prefix="ele-alembic-", suffix=".db")
    db_url = f"sqlite+aiosqlite:///{tmp_path}"
    try:
        await asyncio.to_thread(_upgrade_head_sync, db_url)

        from sqlalchemy import inspect
        from sqlalchemy.ext.asyncio import create_async_engine

        from app.db.models import Base

        engine = create_async_engine(db_url)
        try:
            async with engine.connect() as conn:

                def collect(connection) -> dict:
                    insp = inspect(connection)
                    return {
                        name: {c["name"] for c in insp.get_columns(name)}
                        for name in insp.get_table_names()
                    }

                actual = await conn.run_sync(collect)
        finally:
            await engine.dispose()

        missing_tables = set(Base.metadata.tables) - set(actual)
        assert not missing_tables, (
            "Tables missing after `alembic upgrade head` "
            f"(model declares, DB lacks): {sorted(missing_tables)}"
        )

        for table_name, model_table in Base.metadata.tables.items():
            expected_columns = {c.name for c in model_table.columns}
            actual_columns = actual[table_name]
            missing_columns = expected_columns - actual_columns
            assert not missing_columns, (
                f"Table '{table_name}' missing columns after migration: "
                f"{sorted(missing_columns)}"
            )
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
