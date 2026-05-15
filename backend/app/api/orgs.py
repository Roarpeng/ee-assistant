"""Organization + preferences CRUD.

``POST /api/orgs`` is the only unauthenticated endpoint — used by the
frontend at first boot to bootstrap a "Default Org" so the user
doesn't see a login wall. All other endpoints require a valid
``X-Volta-Org-Token`` (via ``Depends(require_org)``).
"""
import secrets
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import OrgCreated, OrgIn, OrgOut, PrefIn, PrefOut
from app.db.models import Organization, OrgPreference
from app.db.repository import get_session
from app.middleware.org_auth import hash_token, require_org

router = APIRouter(prefix="/api/orgs", tags=["orgs"])


def _gen_code(name: str) -> str:
    # short slug + random suffix; uniqueness handled by retry in caller
    slug = "".join(c for c in name.lower() if c.isalnum())[:16] or "org"
    return f"{slug}-{secrets.token_hex(4)}"


@router.post("", response_model=OrgCreated, status_code=status.HTTP_201_CREATED)
async def create_org(
    body: OrgIn,
    session: AsyncSession = Depends(get_session),
):
    token = secrets.token_urlsafe(32)
    org = Organization(
        id=str(uuid.uuid4()),
        name=body.name,
        code=_gen_code(body.name),
        token_hash=hash_token(token),
    )
    session.add(org)
    await session.commit()
    await session.refresh(org)
    return OrgCreated(id=org.id, name=org.name, code=org.code, token=token)


@router.get("/me", response_model=OrgOut)
async def me(org: Organization = Depends(require_org)):
    return org


@router.get("/me/preferences", response_model=list[PrefOut])
async def list_prefs(
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(OrgPreference).where(OrgPreference.org_id == org.id)
        )
    ).scalars().all()
    return rows


@router.put("/me/preferences/{key}", response_model=PrefOut)
async def upsert_pref(
    key: str,
    body: PrefIn,
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
):
    existing = (
        await session.execute(
            select(OrgPreference).where(
                OrgPreference.org_id == org.id,
                OrgPreference.key == key,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.value = body.value
        if body.confidence is not None:
            existing.confidence = body.confidence
        if body.source is not None:
            existing.source = body.source
        existing.updated_at = datetime.utcnow()
        row = existing
    else:
        row = OrgPreference(
            org_id=org.id,
            key=key,
            value=body.value,
            confidence=body.confidence if body.confidence is not None else 0.5,
            source=body.source or "admin",
        )
        session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/me/preferences/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pref(
    key: str,
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
):
    await session.execute(
        delete(OrgPreference).where(
            OrgPreference.org_id == org.id,
            OrgPreference.key == key,
        )
    )
    await session.commit()
