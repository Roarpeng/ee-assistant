# M1 — Organization Identity + Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` syntax.

**Spec**: `../specs/2026-05-14-memory-flywheel-design.md` §3.4, §6 M1
**Branch**: `feat/blueprint-ui-refresh`
**Goal**: Volta now learns "this org always uses Siemens / 24VDC / SIL2" — second project from the same org skips the questions M0 still asks every time.

**Architecture**: 3 disjoint tracks dispatched in parallel.
- **Track A** (backend foundation): two new tables, auth middleware, CRUD endpoints, FK on projects.
- **Track B** (backend enrichment): `RequirementsAgent` reads org_preferences; clarify answers write back with confidence bump.
- **Track C** (frontend): bootstrap-on-boot org creation, settings panel, header injection for every API request.

**Tech Stack**: FastAPI middleware, SQLAlchemy 2 async, alembic, hashlib (token hashing), React + Zustand + Tailwind.

**Pre-assigned alembic revisions**:
- `004_organizations` — Track A, `down_revision = "003_chat_messages"`
- `005_projects_org_fk` — Track A, `down_revision = "004_organizations"`
- Track B does NOT add migrations.

**Interface contracts (frozen before dispatch — every track depends on these)**:

```python
# organizations
class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)  # sha256 hex
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# org_preferences (composite PK)
class OrgPreference(Base):
    __tablename__ = "org_preferences"
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    source: Mapped[str] = mapped_column(String(24), nullable=False, default="clarify")  # 'clarify'|'admin'|'inferred'
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# projects.org_id (additive FK, NULL-able for back-compat)
# ALTER TABLE projects ADD COLUMN org_id VARCHAR(36) REFERENCES organizations(id);
```

**REST contract (frozen)**:
- `POST /api/orgs` (body: `{name: str}`) → `201 {id, name, code, token}` — `token` only shown ONCE here, stored client-side
- `GET /api/orgs/me` (header `X-Volta-Org-Token: <token>`) → `200 {id, name, code}`; `401` if invalid
- `GET /api/orgs/me/preferences` → `200 [{key, value, confidence, source, updated_at}, ...]`
- `PUT /api/orgs/me/preferences/{key}` (body: `{value, confidence?, source?}`) → `200` echoed row
- `DELETE /api/orgs/me/preferences/{key}` → `204`

**Middleware**:
- New `app/middleware/org_auth.py` reads `X-Volta-Org-Token`, hashes (sha256), looks up org, sets `request.state.org_id` (or `None`)
- Helper `get_current_org(request: Request) -> Organization | None` for dependency injection
- Endpoints under `/api/orgs/me/*` require non-None org via `Depends(require_org)` (`HTTPException(401)` otherwise)
- `/api/projects/*` continues to work with or without org

**Recognised preference keys** (stored as constants in `app/core/org_prefs_keys.py`):

```python
PREF_PLC_FAMILY = "preferred_plc_family"   # value: {"family": "S7-1200"}
PREF_SAFETY_LEVEL = "default_safety_level"  # value: {"level": "SIL2"}
PREF_ENVIRONMENT = "default_environment"    # value: {"env": "indoor"}
PREF_VOLTAGE = "voltage_standard"           # value: {"volts": 24}
PREF_HMI_BRAND = "preferred_hmi_brand"      # value: {"brand": "Siemens"}
PREF_BRAND_BLACKLIST = "brand_blacklist"    # value: {"brands": ["X"]}
```

---

## Track A — Foundation (tables + middleware + endpoints)

**Files** (8 total):
- Create `backend/alembic/versions/004_organizations.py`
- Create `backend/alembic/versions/005_projects_org_fk.py`
- Modify `backend/app/db/models.py` (append `Organization`, `OrgPreference`, add `org_id` to `Project`)
- Create `backend/app/middleware/__init__.py` (empty)
- Create `backend/app/middleware/org_auth.py`
- Create `backend/app/api/orgs.py`
- Modify `backend/app/main.py` (register middleware + router)
- Modify `backend/app/core/schemas.py` (Pydantic shapes)
- Create `backend/tests/test_api_orgs.py`

### A1: Models

- [ ] **A1.1** Append `Organization` + `OrgPreference` classes to `models.py` per the frozen schema above. Add `org_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=True, index=True)` to existing `Project` class. Imports needed: `Float`. Check existing imports first.

### A2: Migrations

- [ ] **A2.1** Create `004_organizations.py` (revision `004_organizations`, down_revision `003_chat_messages`):

```python
"""organizations + org_preferences tables

Revision ID: 004_organizations
Revises: 003_chat_messages
"""
import sqlalchemy as sa
from alembic import op

revision = "004_organizations"
down_revision = "003_chat_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("code", sa.String(64), nullable=False, unique=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "org_preferences",
        sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", sa.JSON, nullable=False),
        sa.Column("confidence", sa.Float, nullable=False, server_default="0.5"),
        sa.Column("source", sa.String(24), nullable=False, server_default="clarify"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("org_preferences")
    op.drop_table("organizations")
```

- [ ] **A2.2** Create `005_projects_org_fk.py` (revision `005_projects_org_fk`, down_revision `004_organizations`):

```python
"""projects.org_id FK (additive, NULL-able for back-compat)

Revision ID: 005_projects_org_fk
Revises: 004_organizations
"""
import sqlalchemy as sa
from alembic import op

revision = "005_projects_org_fk"
down_revision = "004_organizations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("org_id", sa.String(36), nullable=True, index=True))
    op.create_foreign_key("fk_projects_org", "projects", "organizations", ["org_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_projects_org", "projects", type_="foreignkey")
    op.drop_column("projects", "org_id")
```

- [ ] **A2.3** `docker compose exec -T backend alembic upgrade head` — expect both new revisions applied.

### A3: Middleware

- [ ] **A3.1** Create empty `backend/app/middleware/__init__.py`.

- [ ] **A3.2** Create `backend/app/middleware/org_auth.py`:

```python
"""Token-based org identity.

Reads `X-Volta-Org-Token`, hashes it with sha256, looks up the
matching `organizations.token_hash`. Sets `request.state.org_id`
to the org UUID, or None if no/invalid token.

No token = no org context = back-compat with pre-M1 behaviour.
Endpoints that *require* an org use `Depends(require_org)`.
"""
import hashlib
from fastapi import Request, HTTPException, Depends, status
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
            org = (await session.execute(
                select(Organization).where(Organization.token_hash == hash_token(token))
            )).scalar_one_or_none()
            if org is not None:
                request.state.org_id = org.id
    response = await call_next(request)
    return response


async def require_org(request: Request, session: AsyncSession = Depends(get_session)) -> Organization:
    org_id = getattr(request.state, "org_id", None)
    if not org_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing or invalid X-Volta-Org-Token")
    org = (await session.execute(
        select(Organization).where(Organization.id == org_id)
    )).scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="org not found")
    return org
```

### A4: Schemas

- [ ] **A4.1** Append to `backend/app/core/schemas.py`:

```python
class OrgIn(BaseModel):
    name: str


class OrgCreated(BaseModel):
    id: str
    name: str
    code: str
    token: str   # only shown at creation


class OrgOut(BaseModel):
    id: str
    name: str
    code: str

    class Config:
        from_attributes = True


class PrefIn(BaseModel):
    value: dict
    confidence: float | None = None
    source: str | None = None


class PrefOut(BaseModel):
    key: str
    value: dict
    confidence: float
    source: str
    updated_at: datetime

    class Config:
        from_attributes = True
```

### A5: Endpoints

- [ ] **A5.1** Create `backend/app/api/orgs.py`:

```python
"""Organization + preferences CRUD.

POST /api/orgs is the only unauthenticated endpoint — used by the
frontend at first boot to bootstrap a 'Default Org' so the user
doesn't see a login wall. All other endpoints require a valid
X-Volta-Org-Token (via Depends(require_org)).
"""
import secrets
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import OrgIn, OrgCreated, OrgOut, PrefIn, PrefOut
from app.db.models import Organization, OrgPreference
from app.db.repository import get_session
from app.middleware.org_auth import hash_token, require_org

router = APIRouter(prefix="/api/orgs", tags=["orgs"])


def _gen_code(name: str) -> str:
    # short slug + random suffix; uniqueness handled by retry in caller
    slug = "".join(c for c in name.lower() if c.isalnum())[:16] or "org"
    return f"{slug}-{secrets.token_hex(4)}"


@router.post("", response_model=OrgCreated, status_code=status.HTTP_201_CREATED)
async def create_org(body: OrgIn, session: AsyncSession = Depends(get_session)):
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
    rows = (await session.execute(
        select(OrgPreference).where(OrgPreference.org_id == org.id)
    )).scalars().all()
    return rows


@router.put("/me/preferences/{key}", response_model=PrefOut)
async def upsert_pref(
    key: str,
    body: PrefIn,
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
):
    existing = (await session.execute(
        select(OrgPreference).where(
            OrgPreference.org_id == org.id, OrgPreference.key == key
        )
    )).scalar_one_or_none()
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
            org_id=org.id, key=key, value=body.value,
            confidence=body.confidence or 0.5,
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
            OrgPreference.org_id == org.id, OrgPreference.key == key
        )
    )
    await session.commit()
```

- [ ] **A5.2** Register router + middleware in `backend/app/main.py`. Find existing `app.include_router(...)` block, add:

```python
from app.middleware.org_auth import org_auth_middleware
app.middleware("http")(org_auth_middleware)

from app.api import orgs as orgs_router
app.include_router(orgs_router.router)
```

### A6: Tests (RED → GREEN)

- [ ] **A6.1** Create `backend/tests/test_api_orgs.py` (use inline `ASGITransport`/`AsyncClient` per `test_api_topology.py` style):

```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

pytestmark = pytest.mark.asyncio


async def _new_client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_create_org_returns_token_once():
    async with await _new_client() as c:
        r = await c.post("/api/orgs", json={"name": "Acme"})
        assert r.status_code == 201
        body = r.json()
        assert body["name"] == "Acme"
        assert "token" in body and len(body["token"]) > 20
        assert "code" in body and body["code"].startswith("acme-")


async def test_me_requires_token():
    async with await _new_client() as c:
        r = await c.get("/api/orgs/me")
        assert r.status_code == 401


async def test_me_with_valid_token():
    async with await _new_client() as c:
        crt = (await c.post("/api/orgs/me-test", json={"name": "Alpha"}))  # wrong path on purpose? no
        crt = (await c.post("/api/orgs", json={"name": "Alpha"}))
        token = crt.json()["token"]
        r = await c.get("/api/orgs/me", headers={"X-Volta-Org-Token": token})
        assert r.status_code == 200
        assert r.json()["name"] == "Alpha"


async def test_pref_upsert_and_list():
    async with await _new_client() as c:
        crt = (await c.post("/api/orgs", json={"name": "Beta"})).json()
        h = {"X-Volta-Org-Token": crt["token"]}
        u = await c.put(
            "/api/orgs/me/preferences/preferred_plc_family",
            headers=h,
            json={"value": {"family": "S7-1200"}, "confidence": 0.9, "source": "admin"},
        )
        assert u.status_code == 200
        assert u.json()["confidence"] == 0.9

        lst = await c.get("/api/orgs/me/preferences", headers=h)
        assert lst.status_code == 200
        items = lst.json()
        assert any(i["key"] == "preferred_plc_family" for i in items)


async def test_pref_delete():
    async with await _new_client() as c:
        crt = (await c.post("/api/orgs", json={"name": "Gamma"})).json()
        h = {"X-Volta-Org-Token": crt["token"]}
        await c.put("/api/orgs/me/preferences/default_safety_level", headers=h, json={"value": {"level": "SIL2"}})
        d = await c.delete("/api/orgs/me/preferences/default_safety_level", headers=h)
        assert d.status_code == 204
        lst = await c.get("/api/orgs/me/preferences", headers=h).json() if False else (await c.get("/api/orgs/me/preferences", headers=h)).json()
        assert all(i["key"] != "default_safety_level" for i in lst)


async def test_invalid_token_rejected():
    async with await _new_client() as c:
        r = await c.get("/api/orgs/me", headers={"X-Volta-Org-Token": "bogus"})
        assert r.status_code == 401
```

- [ ] **A6.2** docker cp + run; iterate RED → GREEN.

### A7: Commit Track A

```bash
git add backend/app/db/models.py \
        backend/alembic/versions/004_organizations.py \
        backend/alembic/versions/005_projects_org_fk.py \
        backend/app/middleware/__init__.py \
        backend/app/middleware/org_auth.py \
        backend/app/api/orgs.py \
        backend/app/main.py \
        backend/app/core/schemas.py \
        backend/tests/test_api_orgs.py
git commit -m "feat(memory M1): Organization identity + preferences (Track A)

- organizations + org_preferences tables (alembic 004)
- projects.org_id additive FK (alembic 005, NULL-able)
- X-Volta-Org-Token middleware + require_org dependency
- POST /api/orgs (bootstrap, no auth) returns token once
- GET /api/orgs/me, GET/PUT/DELETE /api/orgs/me/preferences
- 6 pytest cases covering token round-trip + prefs CRUD"
```

---

## Track B — RequirementsAgent enrichment + clarify writeback

**Files** (5 total):
- Create `backend/app/core/org_prefs_keys.py` (constants — depended on by frontend too, but agent will export them)
- Create `backend/app/core/org_prefs_service.py` (read/write helpers with confidence bump logic)
- Modify `backend/app/core/graph/agents.py` (RequirementsAgent enrichment)
- Create `backend/app/api/clarify_answer.py` (the writeback endpoint)
- Modify `backend/app/main.py` (register clarify_answer router) **— shared file with Track A; Track A registers `org_auth_middleware` + `orgs_router`, Track B registers ONLY `clarify_answer_router`. Use distinct lines, both will land cleanly.**
- Create `backend/tests/test_clarify_writeback.py`
- Create `backend/tests/test_requirements_enrichment.py`

### B1: Preference key constants

- [ ] **B1.1** Create `backend/app/core/org_prefs_keys.py`:

```python
"""Canonical preference key strings shared by backend + frontend.

Keep this file dependency-free so it can be imported anywhere,
including by the alembic migrations if needed."""

PREF_PLC_FAMILY = "preferred_plc_family"        # value: {"family": "S7-1200"}
PREF_SAFETY_LEVEL = "default_safety_level"       # value: {"level": "SIL2"}
PREF_ENVIRONMENT = "default_environment"          # value: {"env": "indoor"}
PREF_VOLTAGE = "voltage_standard"                # value: {"volts": 24}
PREF_HMI_BRAND = "preferred_hmi_brand"             # value: {"brand": "Siemens"}
PREF_BRAND_BLACKLIST = "brand_blacklist"          # value: {"brands": ["X"]}

ALL_KEYS = (
    PREF_PLC_FAMILY,
    PREF_SAFETY_LEVEL,
    PREF_ENVIRONMENT,
    PREF_VOLTAGE,
    PREF_HMI_BRAND,
    PREF_BRAND_BLACKLIST,
)


# Map: requirement-field → (preference-key, value-extractor)
# Used by RequirementsAgent to figure out which prefs fill which req gaps.
REQ_FIELD_TO_PREF = {
    "plc_family": (PREF_PLC_FAMILY, lambda v: v.get("family")),
    "safety_level": (PREF_SAFETY_LEVEL, lambda v: v.get("level")),
    "environment": (PREF_ENVIRONMENT, lambda v: v.get("env")),
}
```

### B2: Service helpers

- [ ] **B2.1** Create `backend/app/core/org_prefs_service.py`:

```python
"""Org preference IO with confidence-bump semantics.

`bump_or_create`:
- first time a key is seen → row inserted at confidence=0.6 (CLARIFY default)
- already exists and value matches → confidence += 0.1, capped at 1.0
- already exists and value differs → confidence resets to 0.6, value overwritten
- source defaults to 'clarify'; admin-side PUT uses source='admin'

`apply_preferences`:
- given a requirement dict with missing/None fields, fills them in
  from org_preferences, returns the enriched dict
- confidence ≥ 0.6 fills directly
- confidence < 0.6 marks the field with prefix `[low-confidence] ` (handled by ClarifyCard layer downstream — out of scope for B2)
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.org_prefs_keys import REQ_FIELD_TO_PREF
from app.db.models import OrgPreference

CONFIDENCE_FILL_THRESHOLD = 0.6
CONFIDENCE_BUMP = 0.1
CONFIDENCE_INITIAL = 0.6
CONFIDENCE_MAX = 1.0


async def bump_or_create(
    session: AsyncSession,
    org_id: str,
    key: str,
    value: dict,
    source: str = "clarify",
) -> OrgPreference:
    row = (await session.execute(
        select(OrgPreference).where(
            OrgPreference.org_id == org_id, OrgPreference.key == key
        )
    )).scalar_one_or_none()
    if row is None:
        row = OrgPreference(
            org_id=org_id, key=key, value=value,
            confidence=CONFIDENCE_INITIAL, source=source,
        )
        session.add(row)
    elif row.value == value:
        row.confidence = min(CONFIDENCE_MAX, row.confidence + CONFIDENCE_BUMP)
    else:
        row.value = value
        row.confidence = CONFIDENCE_INITIAL
        row.source = source
    await session.commit()
    await session.refresh(row)
    return row


async def get_prefs(session: AsyncSession, org_id: str) -> dict[str, OrgPreference]:
    rows = (await session.execute(
        select(OrgPreference).where(OrgPreference.org_id == org_id)
    )).scalars().all()
    return {r.key: r for r in rows}


async def apply_preferences(
    session: AsyncSession,
    org_id: str | None,
    requirement: dict,
) -> dict:
    """Fill missing requirement fields from org prefs (if confidence high)."""
    if not org_id:
        return requirement
    prefs = await get_prefs(session, org_id)
    enriched = dict(requirement)
    for req_field, (pref_key, extractor) in REQ_FIELD_TO_PREF.items():
        if enriched.get(req_field):
            continue
        pref = prefs.get(pref_key)
        if pref and pref.confidence >= CONFIDENCE_FILL_THRESHOLD:
            v = extractor(pref.value)
            if v:
                enriched[req_field] = v
    return enriched
```

### B3: RequirementsAgent enrichment

- [ ] **B3.1** Read `backend/app/core/graph/agents.py` to find `requirements_agent`. Currently it produces a `req` dict from user_input, calls `detect_clarification`, and returns `{requirement, safety_level, stage, clarification?}`.

Modify it so that AFTER `req` is parsed but BEFORE `detect_clarification`, it applies org preferences:

```python
async def requirements_agent(state: AnalysisState) -> dict:
    # ... existing parsing logic that produces `req` ...

    # NEW — org-preference enrichment
    org_id = state.get("org_id")
    if org_id:
        from app.core.org_prefs_service import apply_preferences
        from app.db.repository import async_session as _sm
        async with _sm() as _s:
            req = await apply_preferences(_s, org_id, req)

    # ... existing detect_clarification call uses (possibly enriched) req ...
    from app.core.clarification_detector import detect_clarification
    clarification = detect_clarification(req)
    # ... rest unchanged ...
```

This requires `AnalysisState` to know about `org_id`. Add it in `backend/app/core/graph/state.py`:

```python
class AnalysisState(TypedDict, total=False):
    # ... existing fields ...
    org_id: str | None
```

And the orchestrator must propagate `org_id` into the initial state. In `backend/app/core/orchestrator.py`, the public API for starting a run accepts `project_id`. **DO NOT modify the orchestrator's public signature** — instead, Track C (frontend) will set `Project.org_id` at project-create time, and the orchestrator will look it up. Add (in orchestrator's input-state builder, where the initial state dict is constructed for a new run):

```python
# Fetch the project's org_id and inject into AnalysisState
from app.db.models import Project
proj = (await session.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
initial_state["org_id"] = proj.org_id if proj else None
```

(If the orchestrator doesn't already have a session at that point, use `async_session() as session:` block.)

### B4: Clarify writeback API

- [ ] **B4.1** Create `backend/app/api/clarify_answer.py`:

```python
"""When the user answers a ClarifyCard, we both inject the choices into
the running graph AND write them back to org_preferences with a
confidence bump, so the same org won't be asked again next time."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.org_prefs_keys import (
    PREF_PLC_FAMILY, PREF_SAFETY_LEVEL, PREF_ENVIRONMENT, PREF_VOLTAGE,
    PREF_HMI_BRAND, PREF_BRAND_BLACKLIST,
)
from app.core.org_prefs_service import bump_or_create
from app.db.models import Organization
from app.db.repository import get_session
from app.middleware.org_auth import require_org

router = APIRouter(prefix="/api/projects/{project_id}/clarify", tags=["clarify"])


# Map ClarifyCard group keys → preference keys. Group keys are
# whatever the requirement-detector produced as `groups[*].key`
# (see backend/app/core/clarification_detector.py).
_GROUP_TO_PREF = {
    "safety_level": (PREF_SAFETY_LEVEL, lambda v: {"level": v}),
    "plc_family": (PREF_PLC_FAMILY, lambda v: {"family": v}),
    "environment": (PREF_ENVIRONMENT, lambda v: {"env": v}),
    "voltage": (PREF_VOLTAGE, lambda v: {"volts": int(v) if v.isdigit() else v}),
    "hmi_brand": (PREF_HMI_BRAND, lambda v: {"brand": v}),
}


class ClarifyAnswer(BaseModel):
    answers: dict[str, str]  # {group_key: chosen_value}


@router.post("/answer")
async def submit_clarify(
    project_id: str,
    body: ClarifyAnswer,
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
):
    written = []
    for group_key, choice in body.answers.items():
        mapped = _GROUP_TO_PREF.get(group_key)
        if mapped is None:
            continue
        pref_key, to_value = mapped
        row = await bump_or_create(
            session, org.id, pref_key, to_value(choice), source="clarify"
        )
        written.append({"key": row.key, "value": row.value, "confidence": row.confidence})
    return {"project_id": project_id, "written": written}
```

- [ ] **B4.2** Register the router in `backend/app/main.py` (separate from Track A's registration line):

```python
from app.api import clarify_answer
app.include_router(clarify_answer.router)
```

### B5: Tests

- [ ] **B5.1** Create `backend/tests/test_clarify_writeback.py` (5 cases: writes new pref, bumps existing same-value, resets on different-value, ignores unknown group keys, rejects missing token).

- [ ] **B5.2** Create `backend/tests/test_requirements_enrichment.py` (3 cases: high-confidence pref fills missing field, low-confidence does NOT fill, no-org returns unchanged req). Mock the agent's parsing layer if needed — call `apply_preferences` directly.

- [ ] **B5.3** docker cp + run; RED → GREEN.

### B6: Commit Track B

```bash
git add backend/app/core/org_prefs_keys.py \
        backend/app/core/org_prefs_service.py \
        backend/app/core/graph/agents.py \
        backend/app/core/graph/state.py \
        backend/app/core/orchestrator.py \
        backend/app/api/clarify_answer.py \
        backend/app/main.py \
        backend/tests/test_clarify_writeback.py \
        backend/tests/test_requirements_enrichment.py
git commit -m "feat(memory M1): RequirementsAgent reads org prefs; clarify answers write back (Track B)

- org_prefs_keys.py: canonical key strings + req-field↔pref-key map
- org_prefs_service.py: bump_or_create (+0.1 same value, reset on diff)
  and apply_preferences (fill req gaps when confidence≥0.6)
- RequirementsAgent now enriches req from org prefs before clarify
  detection — second project from same org skips known questions
- POST /api/projects/{id}/clarify/answer: ClarifyCard writeback
- orchestrator + AnalysisState.org_id propagation
- 8 pytest cases (5 writeback + 3 enrichment)"
```

---

## Track C — Frontend bootstrap + settings + clarify writeback

**Files** (8 total):
- Create `frontend/src/services/orgClient.ts` (token storage + header injection wrapper)
- Modify `frontend/src/services/api.ts` (route every request through `orgClient.authedFetch`; add org endpoints)
- Modify `frontend/src/models/store.ts` (add `org` field + `bootstrapOrg` + `refreshPreferences`)
- Modify `frontend/src/App.tsx` (call `bootstrapOrg` on mount, before chat hooks)
- Create `frontend/src/views/components/OrgSettingsPanel.tsx`
- Create `frontend/src/views/components/OrgSettingsPanel.test.tsx`
- Modify `frontend/src/views/components/ConversationSidebar.tsx` (add "组织设置" button at the bottom)
- Modify `frontend/src/views/components/ClarifyCard.tsx` (POST to `/api/projects/{id}/clarify/answer` on submit)
- Create `frontend/src/services/orgClient.test.ts`

### C1: orgClient

- [ ] **C1.1** Create `frontend/src/services/orgClient.ts`:

```typescript
/**
 * Org-token storage + authed-fetch wrapper.
 *
 * Bootstrap flow (first launch, no token in localStorage):
 *   1. POST /api/orgs {name: "Default Org"}
 *   2. server returns {id, name, code, token} — token shown ONCE
 *   3. we store the token in localStorage under `volta-org-token`
 *   4. every subsequent fetch sends X-Volta-Org-Token header
 *
 * Replace the org by clearing localStorage and reloading the page.
 */
const STORAGE_KEY = 'volta-org-token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string) {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {}
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** fetch() with X-Volta-Org-Token header attached if present */
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('X-Volta-Org-Token', token);
  return fetch(input, { ...init, headers });
}

export interface OrgInfo {
  id: string;
  name: string;
  code: string;
}

export interface OrgCreated extends OrgInfo {
  token: string;
}

export interface OrgPreference {
  key: string;
  value: Record<string, unknown>;
  confidence: number;
  source: string;
  updated_at: string;
}

export const orgApi = {
  async bootstrap(name = 'Default Org'): Promise<OrgCreated> {
    const r = await fetch('/api/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) throw new Error(`bootstrap ${r.status}`);
    return r.json();
  },

  async me(): Promise<OrgInfo> {
    const r = await authedFetch('/api/orgs/me');
    if (!r.ok) throw new Error(`me ${r.status}`);
    return r.json();
  },

  async listPreferences(): Promise<OrgPreference[]> {
    const r = await authedFetch('/api/orgs/me/preferences');
    if (!r.ok) throw new Error(`list prefs ${r.status}`);
    return r.json();
  },

  async upsertPreference(
    key: string,
    value: Record<string, unknown>,
    opts?: { confidence?: number; source?: string },
  ): Promise<OrgPreference> {
    const r = await authedFetch(`/api/orgs/me/preferences/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, ...opts }),
    });
    if (!r.ok) throw new Error(`upsert pref ${r.status}`);
    return r.json();
  },

  async deletePreference(key: string): Promise<void> {
    const r = await authedFetch(`/api/orgs/me/preferences/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
    if (!r.ok && r.status !== 204) throw new Error(`delete pref ${r.status}`);
  },
};
```

### C2: API client switches to authedFetch

- [ ] **C2.1** In `frontend/src/services/api.ts`, replace every raw `fetch(...)` call with `authedFetch(...)`. Add `import { authedFetch } from './orgClient';` at the top. Don't change semantics of any existing endpoint — only the header injection.

### C3: Store

- [ ] **C3.1** Add to `frontend/src/models/store.ts` (`AppState` interface + setters):

```typescript
org: OrgInfo | null;
preferences: OrgPreference[];

bootstrapOrg: () => Promise<void>;
refreshPreferences: () => Promise<void>;
```

Implementation:

```typescript
org: null,
preferences: [],

bootstrapOrg: async () => {
  const { orgApi, getStoredToken, setStoredToken } = await import('../services/orgClient');
  let token = getStoredToken();
  if (!token) {
    const created = await orgApi.bootstrap('Default Org');
    setStoredToken(created.token);
    set({ org: { id: created.id, name: created.name, code: created.code } });
  } else {
    try {
      const me = await orgApi.me();
      set({ org: me });
    } catch {
      // Bad/stale token — clear and re-bootstrap once.
      const { clearStoredToken } = await import('../services/orgClient');
      clearStoredToken();
      const created = await orgApi.bootstrap('Default Org');
      setStoredToken(created.token);
      set({ org: { id: created.id, name: created.name, code: created.code } });
    }
  }
  await get().refreshPreferences();
},

refreshPreferences: async () => {
  try {
    const { orgApi } = await import('../services/orgClient');
    const prefs = await orgApi.listPreferences();
    set({ preferences: prefs });
  } catch {}
},
```

### C4: App boot

- [ ] **C4.1** In `frontend/src/App.tsx`, on first mount, before any project loading:

```typescript
useEffect(() => { void useStore.getState().bootstrapOrg(); }, []);
```

### C5: Settings panel

- [ ] **C5.1** Create `frontend/src/views/components/OrgSettingsPanel.tsx` — a modal opened from ConversationSidebar. Shows:

- Org name + code (read-only)
- Preferences table: key / value (formatted) / confidence (bar) / source / updated_at / edit / delete buttons
- "添加偏好" button → small form (key dropdown of ALL_KEYS-equivalent + JSON value input)
- "重置组织" footer link that calls `clearStoredToken()` + reloads page (with confirm)

Use the existing engineering-theme styling (`bg-surface` etc.); look at how `BOMPanel.tsx` styles a similar tabular UI for reference. Include a working component — not just a stub.

### C6: ClarifyCard writeback

- [ ] **C6.1** Modify `ClarifyCard.tsx`. When the user clicks the existing "确认" button (or whatever submits the choices), in addition to whatever it does today, also fire:

```typescript
import { authedFetch } from '../../services/orgClient';
import { useStore } from '../../models/store';

const project = useStore.getState().project;
if (project) {
  authedFetch(`/api/projects/${project.id}/clarify/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: selected }),
  }).catch(() => {});
  void useStore.getState().refreshPreferences();
}
```

(`selected` is the `{[group_key]: chosen}` map ClarifyCard already maintains internally.)

### C7: Sidebar button

- [ ] **C7.1** In `ConversationSidebar.tsx`, add a "组织设置" button at the bottom of the sidebar that toggles the OrgSettingsPanel modal. Wire it to a `useState<boolean>(false)` for visibility.

### C8: Tests

- [ ] **C8.1** Create `frontend/src/services/orgClient.test.ts` covering: storage round-trip, authedFetch header injection (mock global fetch), bootstrap returns token, me uses header.

- [ ] **C8.2** Create `frontend/src/views/components/OrgSettingsPanel.test.tsx` covering: render with empty preferences, render with prefs, delete-button calls API, add-preference flow.

### C9: Commit Track C

```bash
git add frontend/src/services/orgClient.ts \
        frontend/src/services/orgClient.test.ts \
        frontend/src/services/api.ts \
        frontend/src/models/store.ts \
        frontend/src/App.tsx \
        frontend/src/views/components/OrgSettingsPanel.tsx \
        frontend/src/views/components/OrgSettingsPanel.test.tsx \
        frontend/src/views/components/ConversationSidebar.tsx \
        frontend/src/views/components/ClarifyCard.tsx
git commit -m "feat(memory M1): frontend org bootstrap + settings + clarify writeback (Track C)

- orgClient.ts: token storage, authedFetch wrapper, orgApi helpers
- api.ts: all existing requests now route through authedFetch
- store.bootstrapOrg(): create+save token on first boot, restore on
  subsequent boots; auto-refresh preferences after
- OrgSettingsPanel: prefs table + add/edit/delete + reset-org link
- ConversationSidebar: '组织设置' entry at the bottom
- ClarifyCard now POSTs to /clarify/answer on submit, refreshes prefs
- vitest: orgClient + OrgSettingsPanel (≥ 8 new tests)"
```

---

## Integration

- [ ] **INT-A**: full backend pytest (expected: 121+ = 113 + ~8 new)
- [ ] **INT-B**: tsc + vitest (expected ≥50 tests)
- [ ] **INT-C**: rebuild backend+frontend, redeploy, all 5 services Up + 200
- [ ] **INT-D**: smoke test — call `POST /api/orgs` from host, save token, call `GET /api/orgs/me` with header, get back the org
- [ ] **INT-E**: graphify update
