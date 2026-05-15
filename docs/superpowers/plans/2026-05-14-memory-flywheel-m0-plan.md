# M0 — Memory Flywheel Foundation Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec**: `../specs/2026-05-14-memory-flywheel-design.md` §6 M0
**Branch**: `feat/blueprint-ui-refresh` (continuation)
**Goal**: Turn Volta's existing "persistence" into real "memory" — checkpoints, chat, and project artifacts all survive a `docker compose restart`.

**Architecture**: 3 independent tracks that touch disjoint files. Dispatch in parallel.
- **Track A** swaps the in-RAM `MemorySaver` for `PostgresSaver` so LangGraph state survives restart.
- **Track B** moves chat history from browser localStorage to a Postgres `chat_messages` table.
- **Track C** fixes the re-run bug where `analyze-v2` crashes on 1:1 unique constraints and duplicates BOM/ST rows.

**Tech Stack**: FastAPI, SQLAlchemy 2 async, asyncpg, alembic, LangGraph 0.2+ with `langgraph-checkpoint-postgres`, pytest, React 18 + Zustand.

**Pre-assigned alembic revisions** (avoid duplicate-head conflicts):
- `002_langgraph_checkpoint` — Track A, `down_revision = '001'`
- `003_chat_messages` — Track B, `down_revision = '002'`

---

## Track A — PostgresSaver replacement

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/alembic/versions/002_langgraph_checkpoint.py`
- Modify: `backend/app/core/graph/builder.py` (full rewrite of `build_graph` checkpointer wiring)
- Modify: `backend/app/core/orchestrator.py` (async checkpointer lifecycle)
- Create: `backend/tests/test_postgres_checkpointer.py`

### Task A1: Add dependency

- [ ] **Step A1.1**: Add to `backend/requirements.txt` directly under `langgraph>=0.2.0`:

```
langgraph-checkpoint-postgres>=2.0.0
psycopg[binary]>=3.2.0
```

- [ ] **Step A1.2**: `docker compose exec -T backend pip install langgraph-checkpoint-postgres "psycopg[binary]"` (transient install in running container so tests work before rebuild).

### Task A2: alembic migration for LangGraph checkpoint tables

The `langgraph.checkpoint.postgres.PostgresSaver` self-creates its tables via `setup()`. We don't define them in alembic — but we need a placeholder migration so the revision chain is correct for Track B.

- [ ] **Step A2.1**: Create `backend/alembic/versions/002_langgraph_checkpoint.py`:

```python
"""langgraph checkpoint tables (managed by PostgresSaver.setup())

LangGraph's PostgresSaver creates its own checkpoint / writes / blobs
tables via `setup()` on first use. We do NOT define them here — this
migration only fixes the revision chain so downstream migrations
have a stable down_revision.

Revision ID: 002_langgraph_checkpoint
Revises: 001_initial_tables
"""
from alembic import op  # noqa: F401

revision = "002_langgraph_checkpoint"
down_revision = "001_initial_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
```

- [ ] **Step A2.2**: Run `docker compose exec -T backend alembic upgrade head` — expect output to include `Running upgrade 001_initial_tables -> 002_langgraph_checkpoint` and no errors.

### Task A3: Write failing test for restart resilience (RED)

- [ ] **Step A3.1**: Create `backend/tests/test_postgres_checkpointer.py`:

```python
"""Verify the LangGraph checkpointer is durable across builder rebuilds.

We can't literally restart the container in unit tests, but we can
verify that two SEPARATE build_graph() invocations sharing the same
project_id (thread_id) see each other's state — which is the same
invariant MemorySaver violated.
"""
import os
import uuid
import pytest

pytestmark = pytest.mark.asyncio


async def test_state_survives_separate_build_graph_calls():
    """First builder writes a 'requirement' on a project_id; a fresh
    builder must see it. With MemorySaver this fails — instances
    don't share state. With PostgresSaver they share the DB."""
    from app.core.graph.builder import build_graph, reset_graph_cache

    project_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": project_id}}

    reset_graph_cache()
    g1 = await build_graph()
    await g1.aupdate_state(config, {"requirement": {"machine_type": "test"}})

    reset_graph_cache()
    g2 = await build_graph()
    state = await g2.aget_state(config)

    assert state.values.get("requirement") == {"machine_type": "test"}
```

- [ ] **Step A3.2**: Copy test into container and confirm RED:

```bash
docker cp backend/tests/test_postgres_checkpointer.py ee-assistant-backend-1:/app/tests/test_postgres_checkpointer.py
docker compose exec -T backend python -m pytest tests/test_postgres_checkpointer.py -v
```

Expected: FAIL — `build_graph` is sync today and `reset_graph_cache` doesn't exist.

### Task A4: Rewrite `build_graph` to async + PostgresSaver

- [ ] **Step A4.1**: Replace **entire** `backend/app/core/graph/builder.py`:

```python
"""LangGraph graph builder.

Uses PostgresSaver so the graph state (`AnalysisState` per project_id)
survives across container restarts. The checkpointer creates and
manages its own tables via `setup()` on first build.
"""
from __future__ import annotations
import asyncio
import os

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from app.core.graph.state import AnalysisState

_compiled_graph = None
_checkpointer_ctx = None
_checkpointer = None
_setup_done = False
_lock = asyncio.Lock()


def _pg_conn_str() -> str:
    """Build a psycopg conninfo from the same env vars asyncpg uses.

    The SQLAlchemy URL is async (postgresql+asyncpg://...); psycopg
    wants a sync-style conninfo. We re-derive from env so the two
    paths stay in sync without parsing the SQLAlchemy URL.
    """
    user = os.getenv("POSTGRES_USER", "postgres")
    pwd = os.getenv("POSTGRES_PASSWORD", "postgres")
    host = os.getenv("POSTGRES_HOST", "postgres")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "ee_assistant")
    return f"postgresql://{user}:{pwd}@{host}:{port}/{db}"


def reset_graph_cache() -> None:
    """For tests: drop the in-process compile cache so the next
    build_graph() rebuilds. Does NOT reset the underlying Postgres
    checkpoint store — that's the point of durability."""
    global _compiled_graph
    _compiled_graph = None


async def build_graph():
    """Async builder. Holds a module-level compile cache so we don't
    re-build the StateGraph on every request, and a module-level
    checkpointer context so the psycopg pool is shared."""
    global _compiled_graph, _checkpointer_ctx, _checkpointer, _setup_done

    async with _lock:
        if _checkpointer is None:
            _checkpointer_ctx = AsyncPostgresSaver.from_conn_string(_pg_conn_str())
            _checkpointer = await _checkpointer_ctx.__aenter__()
        if not _setup_done:
            await _checkpointer.setup()
            _setup_done = True

        if _compiled_graph is not None:
            return _compiled_graph

        workflow = StateGraph(AnalysisState)

        from app.core.graph.agents import (
            requirements_agent,
            category_mapper,
            safety_assessor,
            constraint_extractor,
            fanout_selection_supervisor,
            rule_validator,
            schematic_generator,
            code_generator,
            final_review_agent,
            commissioning_generator,
            wiring_generator,
        )

        workflow.add_node("requirements_agent", requirements_agent)
        workflow.add_node("category_mapper", category_mapper)
        workflow.add_node("safety_assessor", safety_assessor)
        workflow.add_node("constraint_extractor", constraint_extractor)
        workflow.add_node("selection_supervisor", fanout_selection_supervisor)
        workflow.add_node("rule_validator", rule_validator)
        workflow.add_node("schematic_generator", schematic_generator)
        workflow.add_node("code_generator", code_generator)
        workflow.add_node("final_review_agent", final_review_agent)
        workflow.add_node("commissioning_generator", commissioning_generator)
        workflow.add_node("wiring_generator", wiring_generator)

        workflow.set_entry_point("requirements_agent")
        workflow.add_edge("requirements_agent", "category_mapper")
        workflow.add_edge("requirements_agent", "safety_assessor")
        workflow.add_edge("requirements_agent", "constraint_extractor")
        workflow.add_edge("category_mapper", "selection_supervisor")
        workflow.add_edge("safety_assessor", "selection_supervisor")
        workflow.add_edge("constraint_extractor", "selection_supervisor")
        workflow.add_edge("selection_supervisor", "rule_validator")
        workflow.add_edge("rule_validator", "schematic_generator")
        workflow.add_edge("rule_validator", "code_generator")
        workflow.add_edge("rule_validator", "final_review_agent")
        workflow.add_edge("rule_validator", "commissioning_generator")
        workflow.add_edge("rule_validator", "wiring_generator")
        workflow.add_edge("schematic_generator", END)
        workflow.add_edge("code_generator", END)
        workflow.add_edge("final_review_agent", END)
        workflow.add_edge("commissioning_generator", END)
        workflow.add_edge("wiring_generator", END)

        _compiled_graph = workflow.compile(checkpointer=_checkpointer)
        return _compiled_graph
```

- [ ] **Step A4.2**: Update `backend/app/core/orchestrator.py` — `build_graph()` is now async. Find every `graph = build_graph()` call and change to `graph = await build_graph()`. There are three: in `stream_graph_analysis`, `resume_graph_analysis`, and `run_graph_analysis`. Use exact str replace:

```
- from app.core.graph.builder import build_graph
+ from app.core.graph.builder import build_graph
```

(import unchanged — only call sites change.)

Three call sites: replace each `graph = build_graph()` with `graph = await build_graph()`.

Also: `current_state = graph.get_state(config)` in `_build_input_state` must become async too. Change the method signature: `def _build_input_state(...)` → `async def _build_input_state(...)`. Inside: `current_state = await graph.aget_state(config)`. Every caller of `_build_input_state` now needs `await`.

Same for `graph.get_state(config).values` at the end of `_stream_events` — change to `(await graph.aget_state(config)).values`.

- [ ] **Step A4.3**: Copy files into container, run RED test again:

```bash
docker cp backend/app/core/graph/builder.py ee-assistant-backend-1:/app/app/core/graph/builder.py
docker cp backend/app/core/orchestrator.py ee-assistant-backend-1:/app/app/core/orchestrator.py
docker compose exec -T backend python -m pytest tests/test_postgres_checkpointer.py -v
```

Expected: PASS.

- [ ] **Step A4.4**: Run full backend suite to make sure nothing else broke:

```bash
docker compose exec -T backend python -m pytest tests/ -q --tb=short --ignore=tests/test_conversation_enhancements.py
```

Expected: 107+ passing (the 106 prior + at least 1 new). Fix any regressions before continuing.

### Task A5: Commit Track A

- [ ] **Step A5.1**:

```bash
git add backend/requirements.txt \
        backend/alembic/versions/002_langgraph_checkpoint.py \
        backend/app/core/graph/builder.py \
        backend/app/core/orchestrator.py \
        backend/tests/test_postgres_checkpointer.py
git commit -m "feat(memory M0): PostgresSaver replaces MemorySaver (Track A)

LangGraph state (per-project_id thread) now persists in Postgres
via AsyncPostgresSaver instead of in-process MemorySaver, so a
docker compose restart no longer loses in-flight checkpoints.

- requirements.txt: add langgraph-checkpoint-postgres + psycopg[binary]
- alembic 002: placeholder so revision chain stays linear
  (PostgresSaver creates its own tables via setup())
- builder.py: async build_graph() with module-level checkpointer
  ctx + setup-on-first-call + reset_graph_cache() for tests
- orchestrator.py: all build_graph()/get_state() calls become async
- new test_postgres_checkpointer.py: asserts state survives two
  separate build_graph() invocations sharing the same thread_id"
```

---

## Track B — `chat_messages` server-side persistence

**Files:**
- Modify: `backend/app/db/models.py` (add `ChatMessage` model)
- Create: `backend/alembic/versions/003_chat_messages.py`
- Modify: `backend/app/core/schemas.py` (add Pydantic shapes)
- Create: `backend/app/api/messages.py`
- Modify: `backend/app/main.py` (register router)
- Create: `backend/tests/test_api_messages.py`
- Modify: `frontend/src/services/api.ts` (add `listMessages`, `appendMessage`)
- Modify: `frontend/src/models/store.ts` (server-first chat history, localStorage = cache)

### Task B1: Add ChatMessage SQLAlchemy model

- [ ] **Step B1.1**: Append to `backend/app/db/models.py` after the last model class (currently `ProjectTopology`):

```python
class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # 'user' | 'assistant' | 'system'
    content: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # ClarifyCard groups, if any
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)  # monotonic per-project, ascending
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

If imports `JSON`, `Integer`, `uuid`, `datetime`, `func`, etc. aren't already at the top of `models.py`, add them (they almost certainly are — verify by reading lines 1-20 first).

### Task B2: alembic migration

- [ ] **Step B2.1**: Create `backend/alembic/versions/003_chat_messages.py`:

```python
"""chat_messages table

Revision ID: 003_chat_messages
Revises: 002_langgraph_checkpoint
"""
import sqlalchemy as sa
from alembic import op

revision = "003_chat_messages"
down_revision = "002_langgraph_checkpoint"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("options", sa.JSON, nullable=True),
        sa.Column("sequence", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_chat_messages_project_seq", "chat_messages", ["project_id", "sequence"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_project_seq", table_name="chat_messages")
    op.drop_table("chat_messages")
```

- [ ] **Step B2.2**: `docker compose exec -T backend alembic upgrade head` — expect `Running upgrade 002_langgraph_checkpoint -> 003_chat_messages`.

### Task B3: Pydantic schemas

- [ ] **Step B3.1**: Append to `backend/app/core/schemas.py`:

```python
class ChatMessageIn(BaseModel):
    role: str
    content: str
    options: list[dict] | None = None


class ChatMessageOut(BaseModel):
    id: str
    project_id: str
    role: str
    content: str
    options: list[dict] | None
    sequence: int
    created_at: datetime

    class Config:
        from_attributes = True
```

### Task B4: Write failing API tests (RED)

- [ ] **Step B4.1**: Create `backend/tests/test_api_messages.py`:

```python
"""API tests for chat_messages persistence."""
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _make_project(client: AsyncClient) -> str:
    resp = await client.post("/api/projects", json={"name": "test-msg"})
    assert resp.status_code == 200
    return resp.json()["id"]


async def test_append_and_list_round_trip(async_client: AsyncClient):
    pid = await _make_project(async_client)
    a = await async_client.post(
        f"/api/projects/{pid}/messages",
        json={"role": "user", "content": "hi"},
    )
    assert a.status_code == 200
    a_body = a.json()
    assert a_body["sequence"] == 0
    assert a_body["role"] == "user"
    assert a_body["content"] == "hi"

    b = await async_client.post(
        f"/api/projects/{pid}/messages",
        json={"role": "assistant", "content": "hello", "options": [{"key": "k", "label": "l", "choices": ["a"]}]},
    )
    assert b.json()["sequence"] == 1

    listing = await async_client.get(f"/api/projects/{pid}/messages")
    assert listing.status_code == 200
    msgs = listing.json()
    assert [m["content"] for m in msgs] == ["hi", "hello"]
    assert msgs[1]["options"] == [{"key": "k", "label": "l", "choices": ["a"]}]


async def test_listing_unknown_project_returns_404(async_client: AsyncClient):
    resp = await async_client.get("/api/projects/00000000-0000-0000-0000-000000000000/messages")
    assert resp.status_code == 404


async def test_append_unknown_project_returns_404(async_client: AsyncClient):
    resp = await async_client.post(
        "/api/projects/00000000-0000-0000-0000-000000000000/messages",
        json={"role": "user", "content": "x"},
    )
    assert resp.status_code == 404
```

- [ ] **Step B4.2**: Copy + run, confirm RED:

```bash
docker cp backend/tests/test_api_messages.py ee-assistant-backend-1:/app/tests/test_api_messages.py
docker compose exec -T backend python -m pytest tests/test_api_messages.py -v
```

Expected: FAIL — `/api/projects/{id}/messages` route doesn't exist (404 for all, including the round-trip test).

### Task B5: Implement messages router

- [ ] **Step B5.1**: Create `backend/app/api/messages.py`:

```python
"""Chat message persistence endpoints.

These move chat history from browser localStorage (lossy, per-device)
to a real server-side store, which is the prerequisite for any
durable memory features downstream.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import ChatMessageIn, ChatMessageOut
from app.db.models import ChatMessage, Project
from app.db.session import get_session

router = APIRouter(prefix="/api/projects/{project_id}/messages", tags=["messages"])


async def _ensure_project(project_id: str, session: AsyncSession) -> None:
    proj = (await session.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if proj is None:
        raise HTTPException(status_code=404, detail="project not found")


@router.get("", response_model=list[ChatMessageOut])
async def list_messages(project_id: str, session: AsyncSession = Depends(get_session)):
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
```

- [ ] **Step B5.2**: Register router. In `backend/app/main.py`, find the block that does `app.include_router(...)` for the other routers (projects, knowledge, analysis, etc.). Add:

```python
from app.api import messages
app.include_router(messages.router)
```

Match the existing import + include_router style; don't re-order existing entries.

- [ ] **Step B5.3**: Copy files + run tests:

```bash
docker cp backend/app/db/models.py ee-assistant-backend-1:/app/app/db/models.py
docker cp backend/app/core/schemas.py ee-assistant-backend-1:/app/app/core/schemas.py
docker cp backend/app/api/messages.py ee-assistant-backend-1:/app/app/api/messages.py
docker cp backend/app/main.py ee-assistant-backend-1:/app/app/main.py
docker compose restart backend
docker compose exec -T backend python -m pytest tests/test_api_messages.py -v
```

Expected: 3 PASS.

### Task B6: Frontend — server-first chat history

- [ ] **Step B6.1**: Add to `frontend/src/services/api.ts` (after the existing exports):

```typescript
export interface ServerChatMessage {
  id: string;
  project_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  options: Array<{ key: string; label: string; choices: string[] }> | null;
  sequence: number;
  created_at: string;
}

export const api = {
  // ... existing methods ...

  async listMessages(projectId: string): Promise<ServerChatMessage[]> {
    const r = await fetch(`/api/projects/${projectId}/messages`);
    if (!r.ok) throw new Error(`listMessages ${r.status}`);
    return r.json();
  },

  async appendMessage(
    projectId: string,
    msg: { role: string; content: string; options?: unknown },
  ): Promise<ServerChatMessage> {
    const r = await fetch(`/api/projects/${projectId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
    if (!r.ok) throw new Error(`appendMessage ${r.status}`);
    return r.json();
  },
};
```

(If `api` is already declared as `export const api = { ... }`, MERGE these two methods inside it; do not declare a second `export const api`.)

- [ ] **Step B6.2**: In `frontend/src/models/store.ts`, find `saveChatHistory` and `loadChatHistory`. Add server sync — they should still hit localStorage as a CACHE, but the source of truth is the server when a project is active. Modify `saveChatHistory` to also POST the latest user/assistant message to the server (fire-and-forget — server failures don't break UX, localStorage cache is the fallback). Modify `loadChatHistory(projectId)` to first try `api.listMessages(projectId)` and only fall back to localStorage on failure.

Concretely:

```typescript
saveChatHistory: () => {
  const { project, messages } = get();
  if (!project) return;
  try {
    const key = `volta-chat-history-${project.id}`;
    localStorage.setItem(key, JSON.stringify(messages.slice(-100)));
  } catch {}
  // Note: server-side persistence happens at message-add time
  //  (see addMessage below) so saveChatHistory remains a pure
  //  localStorage snapshot for offline reads.
},

loadChatHistory: async (projectId: string) => {
  // Server is the source of truth; localStorage is the offline fallback.
  try {
    const { api } = await import('../services/api');
    const serverMsgs = await api.listMessages(projectId);
    const messages = serverMsgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      options: m.options ?? undefined,
      timestamp: new Date(m.created_at).getTime(),
    }));
    set({ messages });
    return;
  } catch {}
  // Fallback: localStorage
  try {
    const key = `volta-chat-history-${projectId}`;
    const raw = localStorage.getItem(key);
    if (raw) set({ messages: JSON.parse(raw) });
  } catch {}
},
```

Then modify `addMessage` so any non-empty role/content gets POSTed to the server in the background (don't block the UI):

```typescript
addMessage: (msg) => {
  const id = msg.id || Math.random().toString(36).slice(2);
  const final = { ...msg, id, timestamp: msg.timestamp || Date.now() };
  set((s) => ({ messages: [...s.messages, final] }));
  // Fire-and-forget server sync (we keep localStorage as cache).
  const { project } = get();
  if (project && final.content && (final.role === 'user' || final.role === 'assistant')) {
    import('../services/api').then(({ api }) => {
      api.appendMessage(project.id, {
        role: final.role,
        content: final.content,
        options: final.options,
      }).catch(() => {});
    });
  }
},
```

Adjust types if `loadChatHistory` was previously synchronous — the AppState type and any caller need to await it. (Caller is `setProject` / `newProject`. Grep for `loadChatHistory` to find them.)

- [ ] **Step B6.3**: Build the frontend to check types:

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step B6.4**: Run vitest:

```bash
cd frontend && npx vitest run
```

Expected: existing 42 tests still pass. (No new vitest needed — the integration is exercised by the backend test_api_messages.py + manual smoke.)

### Task B7: Commit Track B

- [ ] **Step B7.1**:

```bash
git add backend/app/db/models.py \
        backend/alembic/versions/003_chat_messages.py \
        backend/app/core/schemas.py \
        backend/app/api/messages.py \
        backend/app/main.py \
        backend/tests/test_api_messages.py \
        frontend/src/services/api.ts \
        frontend/src/models/store.ts
git commit -m "feat(memory M0): server-side chat_messages persistence (Track B)

Chat history now lives in Postgres, not just browser localStorage.
This unblocks every later memory feature — sleep-time consolidation
and episodic memory both depend on a durable chat record.

Backend:
- chat_messages table with (project_id, sequence) index for ordered
  reads, JSON 'options' column for ClarifyCard payloads.
- GET/POST /api/projects/{id}/messages endpoints + 3 pytest cases.

Frontend:
- api.listMessages / api.appendMessage helpers.
- store.loadChatHistory now async, server-first with localStorage
  fallback; addMessage fires server-sync in background.
- localStorage remains as offline cache only."
```

---

## Track C — re-run idempotency

**Files:**
- Modify: `backend/app/api/analysis.py` (the two save sections)
- Create: `backend/tests/test_analyze_idempotent.py`

### Task C1: Write the failing test (RED)

- [ ] **Step C1.1**: Create `backend/tests/test_analyze_idempotent.py`:

```python
"""Re-running analysis on the same project must not crash on the
1:1 unique constraint and must not duplicate BOM/ST rows.

We don't drive the full LangGraph DAG (LLM-dependent) — we exercise
the save_to_db helper directly with two consecutive payloads."""
import uuid
import pytest
from sqlalchemy import select, func

from app.db.models import Project, Requirement, Schematic, BOMItem, STModule

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def project(async_session):
    pid = str(uuid.uuid4())
    async_session.add(Project(id=pid, name="test-rerun", status="started"))
    await async_session.commit()
    return pid


def _payload(model_label: str):
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
            {"category": "PLC_CPU", "manufacturer": "Siemens", "model": model_label, "quantity": 1, "specifications": {}},
        ],
        "mermaid_code": f"graph TD\n    A[{model_label}]",
        "topology": {"nodes": [], "edges": []},
        "st_modules": [{"name": "Main_OB1", "module_type": "OB", "code": "// v1", "sort_order": 0}],
        "review_notes": [],
    }


async def test_save_twice_no_unique_violation(async_session, project: str):
    from app.api.analysis import save_to_db

    await save_to_db(async_session, project, _payload("CPU 1212C"))
    # Second save must not raise on requirements/schematics 1:1 unique.
    await save_to_db(async_session, project, _payload("CPU 1214C"))

    req_count = (await async_session.execute(
        select(func.count(Requirement.id)).where(Requirement.project_id == project)
    )).scalar_one()
    sch_count = (await async_session.execute(
        select(func.count(Schematic.id)).where(Schematic.project_id == project)
    )).scalar_one()
    assert req_count == 1, f"requirements should still be 1:1 ({req_count})"
    assert sch_count == 1, f"schematics should still be 1:1 ({sch_count})"


async def test_save_twice_no_duplicate_bom_or_st(async_session, project: str):
    from app.api.analysis import save_to_db

    await save_to_db(async_session, project, _payload("CPU 1212C"))
    await save_to_db(async_session, project, _payload("CPU 1214C"))

    bom_rows = (await async_session.execute(
        select(BOMItem).where(BOMItem.project_id == project)
    )).scalars().all()
    st_rows = (await async_session.execute(
        select(STModule).where(STModule.project_id == project)
    )).scalars().all()
    assert len(bom_rows) == 1, f"bom_items should reflect 2nd run only ({len(bom_rows)})"
    assert bom_rows[0].model == "CPU 1214C"
    assert len(st_rows) == 1
    assert st_rows[0].code == "// v1"  # idempotent on identical input is fine


async def test_save_updates_requirement_fields(async_session, project: str):
    from app.api.analysis import save_to_db

    await save_to_db(async_session, project, _payload("CPU 1212C"))
    p2 = _payload("CPU 1214C")
    p2["requirement"]["safety_level"] = "SIL3"
    await save_to_db(async_session, project, p2)

    req = (await async_session.execute(
        select(Requirement).where(Requirement.project_id == project)
    )).scalar_one()
    assert req.safety_level == "SIL3"
```

- [ ] **Step C1.2**: Confirm RED:

```bash
docker cp backend/tests/test_analyze_idempotent.py ee-assistant-backend-1:/app/tests/test_analyze_idempotent.py
docker compose exec -T backend python -m pytest tests/test_analyze_idempotent.py -v
```

Expected: errors — either `save_to_db` isn't exported as a top-level helper yet, or test_save_twice_no_unique_violation raises IntegrityError, or the duplicate-count assertions fail. Whatever the first failure is, that's the RED signal to fix.

### Task C2: Extract & rewrite the save logic

`backend/app/api/analysis.py` currently has TWO duplicated save blocks (around lines 117-174 in `analyze-v2` and 248-304 in `resume`). Both:
1. Insert `Requirement` (fails 1:1 on second run).
2. Insert `IOItem`s and `LogicRule`s (append-only).
3. Append `BOMItem`s (creates dupes).
4. Insert `Schematic` (fails 1:1 on second run).
5. Append `STModule`s (creates dupes).
6. Bump `Project.status`.

Refactor: extract a top-level `async def save_to_db(session, project_id, payload)` helper, replace the duplicated bodies with calls. Make it idempotent.

- [ ] **Step C2.1**: Read `backend/app/api/analysis.py` fully and locate the two save blocks. Inline them — they should be byte-equivalent or near-so.

- [ ] **Step C2.2**: At module scope (above the route handlers), add:

```python
async def save_to_db(session, project_id: str, payload: dict) -> None:
    """Idempotent project persistence.

    Re-running analysis on the same project_id is supported:
    - requirements/schematics are 1:1 with a unique constraint, so
      we delete-then-insert.
    - bom_items / st_modules are append-only by schema but logically
      "the latest run wins" — so we delete-then-insert too.
    - io_items / logic_rules cascade off requirements so they're
      wiped by that delete.
    """
    from sqlalchemy import delete, select, update
    from app.db.models import (
        Project, Requirement, IOItem, LogicRule,
        BOMItem, Schematic, STModule,
    )

    req_payload = payload.get("requirement") or {}
    bom_payload = payload.get("bom_items") or []
    mermaid = payload.get("mermaid_code")
    topology = payload.get("topology")
    st_payload = payload.get("st_modules") or []

    # ── Requirements (1:1) ────────────────────────────────────────
    # Cascade-delete IOItem / LogicRule via FK ON DELETE CASCADE if
    # present, otherwise clear manually.
    existing_req_id = (await session.execute(
        select(Requirement.id).where(Requirement.project_id == project_id)
    )).scalar_one_or_none()
    if existing_req_id is not None:
        await session.execute(delete(IOItem).where(IOItem.requirement_id == existing_req_id))
        await session.execute(delete(LogicRule).where(LogicRule.requirement_id == existing_req_id))
        await session.execute(delete(Requirement).where(Requirement.id == existing_req_id))

    req = Requirement(
        project_id=project_id,
        machine_type=req_payload.get("machine_type"),
        safety_level=req_payload.get("safety_level"),
        environment=req_payload.get("environment"),
        plc_family=req_payload.get("plc_family"),
        raw_text=req_payload.get("raw_text", ""),
    )
    session.add(req)
    await session.flush()
    for io in req_payload.get("io_list", []):
        session.add(IOItem(
            requirement_id=req.id,
            tag=io.get("tag", ""),
            io_type=io.get("type", ""),
            description=io.get("description", ""),
        ))
    for rule in req_payload.get("control_logic", []):
        session.add(LogicRule(requirement_id=req.id, description=str(rule)))

    # ── BOM (delete-then-insert) ──────────────────────────────────
    await session.execute(delete(BOMItem).where(BOMItem.project_id == project_id))
    for item in bom_payload:
        session.add(BOMItem(
            project_id=project_id,
            category=item.get("category", ""),
            manufacturer=item.get("manufacturer", ""),
            model=item.get("model", ""),
            quantity=int(item.get("quantity") or 1),
            specifications=item.get("specifications") or {},
        ))

    # ── Schematic (1:1) ───────────────────────────────────────────
    await session.execute(delete(Schematic).where(Schematic.project_id == project_id))
    if mermaid:
        session.add(Schematic(project_id=project_id, mermaid_code=mermaid))

    # ── ST modules (delete-then-insert) ───────────────────────────
    await session.execute(delete(STModule).where(STModule.project_id == project_id))
    for m in st_payload:
        session.add(STModule(
            project_id=project_id,
            name=m.get("name", ""),
            module_type=m.get("module_type", ""),
            code=m.get("code", ""),
            sort_order=int(m.get("sort_order") or 0),
        ))

    await session.execute(
        update(Project).where(Project.id == project_id).values(status="completed")
    )
    await session.commit()
```

- [ ] **Step C2.3**: Replace the inline save blocks in `analyze-v2` and `resume` with calls to `save_to_db(session, project_id, final_payload)`. Keep behaviour identical (same `try/except` wrapping that logs but doesn't fail the SSE response).

- [ ] **Step C2.4**: Copy + run test, expect GREEN:

```bash
docker cp backend/app/api/analysis.py ee-assistant-backend-1:/app/app/api/analysis.py
docker compose exec -T backend python -m pytest tests/test_analyze_idempotent.py -v
```

Expected: 3 PASS.

- [ ] **Step C2.5**: Confirm no regression:

```bash
docker compose exec -T backend python -m pytest tests/ -q --tb=short --ignore=tests/test_conversation_enhancements.py
```

Expected: 109+ passing.

### Task C3: Commit Track C

- [ ] **Step C3.1**:

```bash
git add backend/app/api/analysis.py backend/tests/test_analyze_idempotent.py
git commit -m "fix(memory M0): re-run analysis is now idempotent (Track C)

Before: a second run of analyze-v2 on the same project_id crashed
on the 1:1 unique constraint over requirements/schematics, and
quietly duplicated BOM/ST rows when it didn't crash.

After: extracted save_to_db helper. requirements/schematics use
delete-then-insert; bom_items/st_modules wipe-and-reinsert so
the latest run wins; io_items/logic_rules cascade off the
requirement delete.

3 new pytest cases assert: (1) no IntegrityError on second save,
(2) no duplicate BOM/ST rows, (3) requirement field updates land."
```

---

## Integration — after all 3 tracks land

### Task INT-1: Full backend suite

- [ ] **Step INT-1.1**:

```bash
docker compose exec -T backend python -m pytest tests/ -q --tb=short --ignore=tests/test_conversation_enhancements.py
```

Expected: 109+ GREEN (106 prior + ≥3 new).

### Task INT-2: Frontend

- [ ] **Step INT-2.1**:

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Expected: tsc clean, vitest 42 GREEN.

### Task INT-3: Rebuild + redeploy

- [ ] **Step INT-3.1**:

```bash
docker compose build backend frontend
docker compose up -d --no-deps backend frontend
```

- [ ] **Step INT-3.2**: Verify containers healthy:

```bash
sleep 15
docker compose ps --format "table {{.Service}}\t{{.Status}}"
curl.exe -s -o NUL -w "frontend: %{http_code}`n" http://localhost:8090/
curl.exe -s -o NUL -w "backend  : %{http_code}`n" http://localhost:8090/api/health
```

Expected: all `Up`, both endpoints `200`.

### Task INT-4: Smoke test — durability

- [ ] **Step INT-4.1**: From the host, create a project, send one chat message, restart backend, fetch messages — they should still be there:

```bash
$pid = (curl.exe -s -X POST http://localhost:8090/api/projects -H "Content-Type: application/json" -d '{\"name\":\"durability-test\"}') | ConvertFrom-Json | Select-Object -ExpandProperty id
curl.exe -s -X POST "http://localhost:8090/api/projects/$pid/messages" -H "Content-Type: application/json" -d '{\"role\":\"user\",\"content\":\"hello before restart\"}'
docker compose restart backend
sleep 10
curl.exe -s "http://localhost:8090/api/projects/$pid/messages"
```

Expected: returns a JSON list including the `"hello before restart"` message.

### Task INT-5: graphify refresh

- [ ] **Step INT-5.1**:

```bash
graphify update .
git add graphify-out/ && git commit -m "chore(graph): rebuild after M0 foundation repair"
```

## Definition of Done

- ✅ 109+ backend tests GREEN
- ✅ tsc + vitest clean
- ✅ All 5 docker services Up
- ✅ Chat message persists across `docker compose restart backend`
- ✅ `MemorySaver` references eliminated from runtime code
- ✅ Re-running analyze on same project doesn't crash
- ✅ Knowledge graph regenerated
