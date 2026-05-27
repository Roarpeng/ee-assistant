"""Decision capture + weight-bump helpers shared by the feedback API
and the orchestrator's interrupt-resume path."""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Decision, SelectionWeight


WEIGHT_BUMP = 1.0


async def record_decision(
    session: AsyncSession,
    *,
    project_id: str,
    org_id: str | None,
    type: str,
    context: dict | None = None,
    before: dict | None = None,
    after: dict | None = None,
    rationale: str | None = None,
) -> Decision:
    row = Decision(
        project_id=project_id,
        org_id=org_id,
        type=type,
        context=context or {},
        before=before,
        after=after,
        rationale=rationale,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def bump_weight(
    session: AsyncSession,
    *,
    org_id: str | None,
    category: str,
    manufacturer: str,
    model: str,
    amount: float = WEIGHT_BUMP,
) -> SelectionWeight:
    # SQLite is finicky about NULL in composite PKs; use a literal
    # placeholder for the "global" bucket. Real org rows pass the actual
    # UUID and remain FK-valid against organizations.id.
    pk_org = org_id or "_global_"
    row = (
        await session.execute(
            select(SelectionWeight).where(
                SelectionWeight.org_id == pk_org,
                SelectionWeight.category == category,
                SelectionWeight.manufacturer == manufacturer,
                SelectionWeight.model == model,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = SelectionWeight(
            org_id=pk_org,
            category=category,
            manufacturer=manufacturer,
            model=model,
            weight=amount,
        )
        session.add(row)
    else:
        row.weight += amount
        row.last_selected_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(row)
    return row


async def lookup_weight(
    session: AsyncSession,
    *,
    org_id: str | None,
    category: str,
    manufacturer: str,
    model: str,
) -> float:
    pk_org = org_id or "_global_"
    row = (
        await session.execute(
            select(SelectionWeight.weight).where(
                SelectionWeight.org_id == pk_org,
                SelectionWeight.category == category,
                SelectionWeight.manufacturer == manufacturer,
                SelectionWeight.model == model,
            )
        )
    ).scalar_one_or_none()
    return float(row or 0.0)
