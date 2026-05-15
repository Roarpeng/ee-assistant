"""Token-based org identity.

Reads ``X-Volta-Org-Token``, hashes it with sha256, looks up the
matching ``organizations.token_hash``. Sets ``request.state.org_id``
to the org UUID, or ``None`` if no/invalid token.

No token = no org context = back-compat with pre-M1 behaviour.
Endpoints that *require* an org use ``Depends(require_org)``.
"""
import hashlib

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Organization
from app.db.repository import get_session


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def org_auth_middleware(request: Request, call_next):
    request.state.org_id = None
    token = request.headers.get("X-Volta-Org-Token")
    if token:
        # Side-channel lookup using a fresh session (middleware can't
        # use the FastAPI Depends() machinery directly).
        from app.db.repository import async_session

        async with async_session() as session:
            org = (
                await session.execute(
                    select(Organization).where(
                        Organization.token_hash == hash_token(token)
                    )
                )
            ).scalar_one_or_none()
            if org is not None:
                request.state.org_id = org.id
    response = await call_next(request)
    return response


async def require_org(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Organization:
    org_id = getattr(request.state, "org_id", None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing or invalid X-Volta-Org-Token",
        )
    org = (
        await session.execute(
            select(Organization).where(Organization.id == org_id)
        )
    ).scalar_one_or_none()
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="org not found",
        )
    return org
