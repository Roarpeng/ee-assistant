"""Chat message persistence endpoints (M0 Track B).

These move chat history from browser localStorage (lossy, per-device)
to a real server-side store, which is the prerequisite for any
durable memory features downstream (sleep-time consolidation,
episodic memory, etc.).

Schema highlights:
- (project_id, sequence) is the natural ordering key for a project's
  chat — sequence is monotonic ascending, computed at append time as
  COALESCE(MAX(sequence), -1) + 1 in a single SQL round-trip.
- options is JSON-typed so ClarifyCard payloads survive round-trip.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import ChatMessageIn, ChatMessageOut
from app.db.models import ChatMessage, Project
from app.db.repository import get_session

router = APIRouter(prefix="/api/projects/{project_id}/messages", tags=["messages"])


async def _ensure_project(project_id: str, session: AsyncSession) -> None:
    proj = (
        await session.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if proj is None:
        raise HTTPException(status_code=404, detail="project not found")


@router.get("", response_model=list[ChatMessageOut])
async def list_messages(
    project_id: str,
    session: AsyncSession = Depends(get_session),
):
    await _ensure_project(project_id, session)
    rows = (
        await session.execute(
            select(ChatMessage)
            .where(ChatMessage.project_id == project_id)
            .order_by(ChatMessage.sequence.asc())
        )
    ).scalars().all()
    return rows


@router.post("", response_model=ChatMessageOut)
async def append_message(
    project_id: str,
    msg: ChatMessageIn,
    session: AsyncSession = Depends(get_session),
):
    await _ensure_project(project_id, session)
    next_seq = (
        await session.execute(
            select(func.coalesce(func.max(ChatMessage.sequence), -1) + 1).where(
                ChatMessage.project_id == project_id
            )
        )
    ).scalar_one()
    row = ChatMessage(
        project_id=project_id,
        role=msg.role,
        content=msg.content,
        options=msg.options,
        sequence=int(next_seq),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row
