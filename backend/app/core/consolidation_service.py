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

There is **no** automatic write-back to the component graph today (see
spec §3.6) — every emitted rule goes to the report for human review.
The endpoint layer is just a thin wrapper around ``consolidate(...)``;
keeping the core logic standalone makes it directly unit-testable.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Decision, WeeklyMemoryReport


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
    now = datetime.utcnow()
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
