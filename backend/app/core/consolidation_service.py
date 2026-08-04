"""Sleep-time consolidation MVP (M3 Track B).

Scans recent ``decisions`` rows for an org and distils them into a
``WeeklyMemoryReport``:

* ``manual_select`` rows whose ``(category, manufacturer, model)`` tuple
  occurs ``>= MIN_RULE_OCCURRENCES`` times become a candidate
  ``new_rule``.
* ``*_edit`` rows are aggregated by their context target into
  ``revisions`` (any count > 0).
* ``thumbs_down`` rows whose context carries category/manufacturer/model
  become ``gaps``.

Rules are NOT written back to the component graph automatically (see
spec §3.6) — every emitted rule goes to the report for human review.
``apply_approved_rules(...)`` is the explicit, human-triggered second
half of the flywheel: it re-matches an approved report's ``new_rules``
against ``component_nodes`` and creates inferred ``ALTERNATIVE_TO``
edges (idempotent — safe to apply repeatedly).
The endpoint layer is just a thin wrapper around ``consolidate(...)``;
keeping the core logic standalone makes it directly unit-testable.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from itertools import combinations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ComponentNode, Decision, WeeklyMemoryReport
from app.core.knowledge_graph import ComponentGraph


MIN_RULE_OCCURRENCES = 3


async def consolidate(
    session: AsyncSession,
    org_id: str | None,
    days: int = 7,
) -> WeeklyMemoryReport:
    """Scan the last ``days`` of decisions for ``org_id`` and persist a
    ``WeeklyMemoryReport``. Returns the freshly-refreshed row.

    Caller owns the session lifecycle. ``org_id=None`` consolidates
    across every org — useful for a future global "house style" pass,
    today only invoked by tests.
    """
    now = datetime.now(timezone.utc)
    period_start = now - timedelta(days=days)

    q = select(Decision).where(Decision.created_at >= period_start)
    if org_id:
        q = q.where(Decision.org_id == org_id)
    rows = (await session.execute(q)).scalars().all()

    selects: Counter[tuple[str, str, str]] = Counter()
    edits: Counter[str] = Counter()
    negatives: Counter[tuple[str, str, str]] = Counter()

    for r in rows:
        rtype = r.type or ""
        after = r.after or {}
        ctx = r.context or {}

        if rtype == "manual_select":
            key = (
                str(after.get("category", "")),
                str(after.get("manufacturer", "")),
                str(after.get("model", "")),
            )
            if all(key):
                selects[key] += 1
        elif rtype.endswith("_edit"):
            target = ctx.get("target") or rtype
            edits[str(target)] += 1
        elif rtype == "thumbs_down":
            key = (
                str(ctx.get("category", "")),
                str(ctx.get("manufacturer", "")),
                str(ctx.get("model", "")),
            )
            if any(key):
                negatives[key] += 1

    new_rules = [
        {"cat": cat, "manufacturer": mfg, "model": model, "occurrences": n}
        for (cat, mfg, model), n in selects.items()
        if n >= MIN_RULE_OCCURRENCES
    ]
    revisions = [
        {"target": target, "occurrences": n}
        for target, n in edits.items()
    ]
    gaps = [
        {"cat": cat, "manufacturer": mfg, "model": model, "occurrences": n}
        for (cat, mfg, model), n in negatives.items()
    ]
    metrics = {
        "decisions_scanned": len(rows),
        "candidate_rules": len(new_rules),
        "revisions_seen": int(sum(edits.values())),
        "gaps_flagged": int(sum(negatives.values())),
    }

    report = WeeklyMemoryReport(
        org_id=org_id,
        period_start=period_start,
        period_end=now,
        new_rules=new_rules,
        revisions=revisions,
        gaps=gaps,
        metrics=metrics,
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)
    return report


async def apply_approved_rules(
    session: AsyncSession,
    report_id: str,
) -> dict:
    """Write an approved report's ``new_rules`` back to the component graph.

    Human-triggered only (memory flywheel: consolidation → sediment).
    For each rule tuple ``(cat, manufacturer, model)``:

    * match existing ``component_nodes`` by ``component_type == cat``
      and ``name == model``; when the node carries a ``manufacturer``
      property it must match case-insensitively;
    * pairwise-link matched nodes with ``ALTERNATIVE_TO`` edges
      (``confidence="inferred"``) carrying a normalized occurrence
      weight; ``ComponentGraph.add_edge`` upserts on
      (source, target, relation) so repeated applies are idempotent;
    * rules with fewer than 2 matched nodes are skipped and recorded
      in the report's ``revisions`` for traceability.

    Returns ``{"edges_created", "applied", "skipped"}``.
    Raises ``LookupError`` when the report does not exist.
    """
    report = (
        await session.execute(
            select(WeeklyMemoryReport).where(WeeklyMemoryReport.id == report_id)
        )
    ).scalar()
    if report is None:
        raise LookupError(f"WeeklyMemoryReport {report_id} not found")

    rules = report.new_rules or []
    if not rules:
        return {"edges_created": 0, "applied": [], "skipped": []}

    max_occ = max(int(r.get("occurrences", 1)) for r in rules) or 1
    graph = ComponentGraph(session)

    edges_created = 0
    applied: list[dict] = []
    skipped: list[dict] = []

    for rule in rules:
        cat = str(rule.get("cat", "")).strip()
        mfg = str(rule.get("manufacturer", "")).strip()
        model = str(rule.get("model", "")).strip()
        if not (cat and mfg and model):
            skipped.append({**rule, "reason": "incomplete rule tuple"})
            continue

        rows = (
            await session.execute(
                select(ComponentNode).where(
                    ComponentNode.component_type == cat,
                    ComponentNode.name == model,
                )
            )
        ).scalars().all()
        matches = [
            n for n in rows
            if not str((n.properties or {}).get("manufacturer", ""))
            or str((n.properties or {})["manufacturer"]).lower() == mfg.lower()
        ]

        if len(matches) < 2:
            skipped.append({
                **rule,
                "reason": f"no graph nodes matched ({len(matches)} found)",
            })
            continue

        weight = round(int(rule.get("occurrences", 1)) / max_occ, 3)
        for a, b in combinations(matches, 2):
            await graph.add_edge(
                source_id=a.id,
                target_id=b.id,
                relation="ALTERNATIVE_TO",
                properties={
                    "weight": weight,
                    "occurrences": int(rule.get("occurrences", 1)),
                    "origin": "consolidation",
                    "report_id": report.id,
                },
                confidence="inferred",
            )
            edges_created += 1
        applied.append(rule)

    if skipped:
        report.revisions = [
            *(report.revisions or []),
            *[
                {
                    "target": f"rule:{s.get('cat', '')}/{s.get('manufacturer', '')}/{s.get('model', '')}",
                    "reason": s.get("reason", "skipped"),
                }
                for s in skipped
            ],
        ]

    await session.commit()
    return {"edges_created": edges_created, "applied": applied, "skipped": skipped}

