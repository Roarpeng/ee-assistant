"""Re-running analysis on the same project must not crash on the
1:1 unique constraint and must not duplicate BOM/ST rows.

We don't drive the full LangGraph DAG (LLM-dependent) — we exercise
the save_to_db helper directly with two consecutive payloads. The
helper is the one extracted from analyze-v2 / resume save blocks
in `app.api.analysis`, so this test covers both code paths.
"""
import uuid

import pytest
from sqlalchemy import func, select

from app.db.models import BOMItem, Project, Requirement, Schematic, STModule
from app.db.repository import async_session as session_maker

pytestmark = pytest.mark.asyncio


async def _make_project() -> str:
    """Insert a fresh Project row and return its id.

    conftest.setup_database (autouse) gives every test a clean
    SQLite, so no cleanup is needed here.
    """
    pid = str(uuid.uuid4())
    async with session_maker() as session:
        session.add(Project(id=pid, name="test-rerun", status="started"))
        await session.commit()
    return pid


def _payload(model_label: str) -> dict:
    """A minimal LangGraph final_state shaped payload. `model_label`
    flows into the BOM row + Mermaid string so we can tell a 1st
    save from a 2nd save apart."""
    return {
        "requirement": {
            "machine_type": "Slide",
            "safety_level": "SIL2",
            "environment": "indoor",
            "plc_family": "S7-1200",
            "io_list": [{"tag": "X", "type": "DI", "description": "d"}],
            "control_logic": ["always run"],
        },
        "bom_items": [
            {
                "category": "PLC_CPU",
                "manufacturer": "Siemens",
                "model": model_label,
                "quantity": 1,
                "specifications": {},
            },
        ],
        "mermaid_code": f"graph TD\n    A[{model_label}]",
        "topology": {"nodes": [], "edges": []},
        "st_modules": [
            {
                "name": "Main_OB1",
                "module_type": "OB",
                "code": "// v1",
                "sort_order": 0,
            }
        ],
        "review_notes": [],
    }


async def test_save_twice_no_unique_violation():
    """Two consecutive save_to_db calls on the same project_id must
    not raise IntegrityError on the requirements / schematics
    unique(project_id) constraints."""
    from app.api.analysis import save_to_db

    pid = await _make_project()

    async with session_maker() as session:
        await save_to_db(session, pid, _payload("CPU 1212C"))
    async with session_maker() as session:
        await save_to_db(session, pid, _payload("CPU 1214C"))

    async with session_maker() as session:
        req_count = (
            await session.execute(
                select(func.count(Requirement.id)).where(
                    Requirement.project_id == pid
                )
            )
        ).scalar_one()
        sch_count = (
            await session.execute(
                select(func.count(Schematic.id)).where(
                    Schematic.project_id == pid
                )
            )
        ).scalar_one()
    assert req_count == 1, f"requirements should still be 1:1 ({req_count})"
    assert sch_count == 1, f"schematics should still be 1:1 ({sch_count})"


async def test_save_twice_no_duplicate_bom_or_st():
    """BOM and ST modules are append-only by schema but logically
    'latest run wins' — re-running must not double the row count."""
    from app.api.analysis import save_to_db

    pid = await _make_project()

    async with session_maker() as session:
        await save_to_db(session, pid, _payload("CPU 1212C"))
    async with session_maker() as session:
        await save_to_db(session, pid, _payload("CPU 1214C"))

    async with session_maker() as session:
        bom_rows = (
            await session.execute(
                select(BOMItem).where(BOMItem.project_id == pid)
            )
        ).scalars().all()
        st_rows = (
            await session.execute(
                select(STModule).where(STModule.project_id == pid)
            )
        ).scalars().all()

    assert len(bom_rows) == 1, (
        f"bom_items should reflect 2nd run only ({len(bom_rows)})"
    )
    assert bom_rows[0].model == "CPU 1214C"
    assert len(st_rows) == 1
    assert st_rows[0].code == "// v1"


async def test_save_updates_requirement_fields():
    """Edits to requirement-level fields on a re-run must land —
    the canonical case being a user bumping safety_level after
    initial analysis."""
    from app.api.analysis import save_to_db

    pid = await _make_project()

    async with session_maker() as session:
        await save_to_db(session, pid, _payload("CPU 1212C"))

    p2 = _payload("CPU 1214C")
    p2["requirement"]["safety_level"] = "SIL3"
    async with session_maker() as session:
        await save_to_db(session, pid, p2)

    async with session_maker() as session:
        req = (
            await session.execute(
                select(Requirement).where(Requirement.project_id == pid)
            )
        ).scalar_one()
    assert req.safety_level == "SIL3"
