"""User-action feedback capture (M2 Track A).

Three POSTs that turn user actions into ``Decision`` rows so the
selection_supervisor can bias future suggestions for the same org:

* ``/select``    — manual_select (also bumps selection_weights)
* ``/edit``      — bom_edit | wiring_edit | topology_edit
* ``/negative``  — thumbs_down

All endpoints require ``X-Volta-Org-Token`` so we always attach an
``org_id`` to the captured Decision. The 404 guard on the project_id
mirrors the pattern in ``app/api/messages.py``.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.decisions_service import bump_weight, record_decision
from app.core.schemas import (
    EditFeedbackIn,
    EditFeedbackOut,
    NegativeFeedbackIn,
    NegativeFeedbackOut,
    SelectFeedbackIn,
    SelectFeedbackOut,
)
from app.db.models import Organization, Project
from app.db.repository import get_session
from app.middleware.org_auth import require_org

router = APIRouter(prefix="/api/projects/{project_id}/feedback", tags=["feedback"])


# Map an EditFeedbackIn.target onto the canonical Decision.type tag.
_EDIT_TARGET_TO_TYPE = {
    "bom": "bom_edit",
    "wiring": "wiring_edit",
    "topology": "topology_edit",
}


async def _ensure_project(session: AsyncSession, project_id: str) -> Project:
    project = (
        await session.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/select", response_model=SelectFeedbackOut, status_code=201)
async def post_select_feedback(
    project_id: str,
    body: SelectFeedbackIn,
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
) -> SelectFeedbackOut:
    await _ensure_project(session, project_id)
    decision = await record_decision(
        session,
        project_id=project_id,
        org_id=org.id,
        type="manual_select",
        context={
            "category": body.category,
            "manufacturer": body.manufacturer,
            "model": body.model,
        },
        before=body.before,
        after={
            "category": body.category,
            "manufacturer": body.manufacturer,
            "model": body.model,
        },
        rationale=body.rationale,
    )
    weight_row = await bump_weight(
        session,
        org_id=org.id,
        category=body.category,
        manufacturer=body.manufacturer,
        model=body.model,
    )
    return SelectFeedbackOut(decision_id=decision.id, weight=weight_row.weight)


@router.post("/edit", response_model=EditFeedbackOut, status_code=201)
async def post_edit_feedback(
    project_id: str,
    body: EditFeedbackIn,
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
) -> EditFeedbackOut:
    await _ensure_project(session, project_id)
    decision_type = _EDIT_TARGET_TO_TYPE.get(body.target)
    if decision_type is None:
        raise HTTPException(
            status_code=422,
            detail=f"invalid edit target: {body.target!r}",
        )
    decision = await record_decision(
        session,
        project_id=project_id,
        org_id=org.id,
        type=decision_type,
        context={"target": body.target},
        before=body.before,
        after=body.after,
        rationale=body.rationale,
    )
    return EditFeedbackOut(decision_id=decision.id)


@router.post("/negative", response_model=NegativeFeedbackOut, status_code=201)
async def post_negative_feedback(
    project_id: str,
    body: NegativeFeedbackIn,
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
) -> NegativeFeedbackOut:
    await _ensure_project(session, project_id)
    decision = await record_decision(
        session,
        project_id=project_id,
        org_id=org.id,
        type="thumbs_down",
        context={"target": body.target, **body.context},
        rationale=body.rationale,
    )
    return NegativeFeedbackOut(decision_id=decision.id)
