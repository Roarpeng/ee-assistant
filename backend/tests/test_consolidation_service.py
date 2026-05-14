"""Sleep-time consolidation MVP (M3 Track B).

Drives ``consolidate(...)`` directly against the test SQLite DB. Each
case seeds raw ``Decision`` rows for a unique org, runs the pass, and
asserts the resulting ``WeeklyMemoryReport`` shape.
"""
from __future__ import annotations

import uuid

import pytest

from app.core.consolidation_service import MIN_RULE_OCCURRENCES, consolidate
from app.core.decisions_service import record_decision
from app.db.models import Organization, Project, WeeklyMemoryReport
from app.db.repository import async_session
from sqlalchemy import select


pytestmark = pytest.mark.asyncio


async def _make_org(name: str) -> str:
    org_id = str(uuid.uuid4())
    async with async_session() as session:
        session.add(
            Organization(
                id=org_id,
                name=name,
                code=f"{name.lower()}-{uuid.uuid4().hex[:8]}",
                token_hash=uuid.uuid4().hex,
            )
        )
        await session.commit()
    return org_id


async def _make_project(org_id: str | None = None) -> str:
    project_id = str(uuid.uuid4())
    async with async_session() as session:
        session.add(Project(id=project_id, name="cons-test", org_id=org_id))
        await session.commit()
    return project_id


# 1. ≥ MIN_RULE_OCCURRENCES manual_select → emit candidate new_rule ──
async def test_consolidate_emits_new_rule_when_threshold_reached():
    org_id = await _make_org("RuleOrg")
    project_id = await _make_project(org_id)

    # Seed exactly MIN_RULE_OCCURRENCES selects of the same tuple, plus
    # one of a different tuple that should NOT promote to a rule.
    async with async_session() as session:
        for _ in range(MIN_RULE_OCCURRENCES):
            await record_decision(
                session,
                project_id=project_id,
                org_id=org_id,
                type="manual_select",
                after={
                    "category": "PLC_CPU",
                    "manufacturer": "Siemens",
                    "model": "S7-1215C",
                },
            )
        await record_decision(
            session,
            project_id=project_id,
            org_id=org_id,
            type="manual_select",
            after={
                "category": "PLC_CPU",
                "manufacturer": "Siemens",
                "model": "S7-1212C",
            },
        )

    async with async_session() as session:
        report = await consolidate(session, org_id=org_id, days=7)

    assert isinstance(report, WeeklyMemoryReport)
    assert report.org_id == org_id
    rules = report.new_rules
    assert len(rules) == 1
    assert rules[0]["model"] == "S7-1215C"
    assert rules[0]["occurrences"] == MIN_RULE_OCCURRENCES
    assert report.metrics["candidate_rules"] == 1
    # MIN+1 selects scanned (3 winning + 1 single-shot)
    assert report.metrics["decisions_scanned"] == MIN_RULE_OCCURRENCES + 1


# 2. thumbs_down with category context → emit gap ───────────────────────
async def test_consolidate_emits_gap_for_thumbs_down_with_context():
    org_id = await _make_org("GapOrg")
    project_id = await _make_project(org_id)

    async with async_session() as session:
        await record_decision(
            session,
            project_id=project_id,
            org_id=org_id,
            type="thumbs_down",
            context={
                "category": "VFD",
                "manufacturer": "ACME",
                "model": "VFD-9001",
                "target": "bom_row",
            },
            rationale="missing PROFINET option",
        )
        # Also record a bom_edit so the revisions counter is non-zero
        await record_decision(
            session,
            project_id=project_id,
            org_id=org_id,
            type="bom_edit",
            context={"target": "bom"},
            before={"qty": 1},
            after={"qty": 2},
        )

    async with async_session() as session:
        report = await consolidate(session, org_id=org_id, days=7)

    assert len(report.gaps) == 1
    gap = report.gaps[0]
    assert gap["cat"] == "VFD"
    assert gap["model"] == "VFD-9001"
    assert gap["occurrences"] == 1

    assert len(report.revisions) == 1
    assert report.revisions[0]["target"] == "bom"
    assert report.revisions[0]["occurrences"] == 1

    assert report.metrics["gaps_flagged"] == 1
    assert report.metrics["revisions_seen"] == 1


# 3. No decisions → empty report with zero metrics ─────────────────────
async def test_consolidate_with_no_decisions_returns_empty_report():
    org_id = await _make_org("QuietOrg")

    async with async_session() as session:
        report = await consolidate(session, org_id=org_id, days=7)

    assert report.new_rules == []
    assert report.revisions == []
    assert report.gaps == []
    assert report.metrics == {
        "decisions_scanned": 0,
        "candidate_rules": 0,
        "revisions_seen": 0,
        "gaps_flagged": 0,
    }
    assert report.period_end > report.period_start
    # And the row was actually persisted
    async with async_session() as session:
        rows = (
            await session.execute(
                select(WeeklyMemoryReport).where(
                    WeeklyMemoryReport.id == report.id
                )
            )
        ).scalars().all()
        assert len(rows) == 1
