# M2 — Flywheel Stage 1 (Decisions + Feedback Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` syntax.

**Spec**: `../specs/2026-05-14-memory-flywheel-design.md` §3.3, §3.5, §6 M2
**Branch**: `feat/blueprint-ui-refresh`
**Goal**: Every user action that disagrees with the AI's suggestion (manual selection at interrupt, BOM edit, 👎) is captured as a structured `Decision`. The selection_supervisor reads these to bias future choices for the same org.

**Architecture**: 3 disjoint tracks, parallel dispatch.

**Pre-assigned alembic revision**: `006_decisions_runhistory_weights` chains off `005_projects_org_fk`.

---

## Frozen schemas

```python
class Decision(Base):
    __tablename__ = "decisions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), index=True, nullable=False)
    org_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)   # 'manual_select' | 'bom_edit' | 'wiring_edit' | 'topology_edit' | 'thumbs_down' | 'clarify'
    context: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class RunHistory(Base):
    __tablename__ = "run_history"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), index=True, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    nodes_executed: Mapped[dict] = mapped_column(JSON, default=dict)   # {node_name: ms_elapsed}
    errors: Mapped[list] = mapped_column(JSON, default=list)            # [{"node": str, "error": str}, ...]
    final_stage: Mapped[str | None] = mapped_column(String(64), nullable=True)


class SelectionWeight(Base):
    __tablename__ = "selection_weights"
    org_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("organizations.id"), primary_key=True, nullable=True)
    category: Mapped[str] = mapped_column(String(64), primary_key=True)
    manufacturer: Mapped[str] = mapped_column(String(120), primary_key=True)
    model: Mapped[str] = mapped_column(String(120), primary_key=True)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    last_selected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

**Note**: `selection_weights.org_id` is part of the composite PK and nullable. Most DBs allow NULL in composite PKs (Postgres does; SQLite does); behaviour for "global preferences" rows uses `org_id IS NULL`. If on SQLite a NULL-in-PK test fails, we'll use the literal string `"_global_"` as the placeholder.

## Frozen REST contract

- `POST /api/projects/{project_id}/feedback/select` body `{category: str, manufacturer: str, model: str, before?: object, rationale?: str}` → 201 `{decision_id, weight}` — also bumps `selection_weights`
- `POST /api/projects/{project_id}/feedback/edit` body `{target: 'bom'|'wiring'|'topology', before: object, after: object, rationale?: str}` → 201 `{decision_id}`
- `POST /api/projects/{project_id}/feedback/negative` body `{target: 'bom_row'|'general', context: object, rationale?: str}` → 201 `{decision_id}`
- `GET /api/projects/{project_id}/memory-sources/{category}/{manufacturer}/{model}` → 200 `{org_pref_match: bool, similar_episodes_count: int, kb_doc_hits: number, rag_score?: number, total_signals: number}` — feeds the BOM "i" popover with M2-era signals (org_preferences from M1, selection_weights from M2; episodes from M3 are wired in later — return 0 for now)

---

## Track A — Tables + feedback endpoints + memory-sources

**Files** (8):
- Create `backend/alembic/versions/006_decisions_runhistory_weights.py`
- Modify `backend/app/db/models.py` (append `Decision`, `RunHistory`, `SelectionWeight`)
- Modify `backend/app/core/schemas.py` (Pydantic in/out shapes for the 3 feedback endpoints + MemorySources)
- Create `backend/app/core/decisions_service.py` (`record_decision` + `bump_weight` helpers)
- Create `backend/app/api/feedback.py` (3 endpoints)
- Create `backend/app/api/memory_sources.py` (1 GET endpoint)
- Create `backend/tests/test_api_feedback.py`
- Create `backend/tests/test_memory_sources.py`

Track A does **NOT** modify `main.py` — parent integrates routers afterward (same pattern as M1).

### A1: Migration

`006_decisions_runhistory_weights` with `down_revision = "005_projects_org_fk"`. Three `op.create_table()` calls in upgrade(), three `op.drop_table()` in downgrade() (reverse order).

### A2: Models

Append three classes per the frozen schemas above. Import `Float`, `Text` if not already present in `models.py` (verify the existing `from sqlalchemy import (...)` block first — these are likely already imported because of OrgPreference/ChatMessage).

### A3: Service

```python
# backend/app/core/decisions_service.py
"""Decision capture + weight-bump helpers shared by the feedback API
and the orchestrator's interrupt-resume path."""
from datetime import datetime
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
        project_id=project_id, org_id=org_id, type=type,
        context=context or {}, before=before, after=after,
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
    # Handle NULL composite-PK quirks on SQLite (treat NULL as '_global_')
    pk_org = org_id or "_global_"
    row = (await session.execute(
        select(SelectionWeight).where(
            SelectionWeight.org_id == pk_org,
            SelectionWeight.category == category,
            SelectionWeight.manufacturer == manufacturer,
            SelectionWeight.model == model,
        )
    )).scalar_one_or_none()
    if row is None:
        row = SelectionWeight(
            org_id=pk_org, category=category, manufacturer=manufacturer,
            model=model, weight=amount,
        )
        session.add(row)
    else:
        row.weight += amount
        row.last_selected_at = datetime.utcnow()
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
    row = (await session.execute(
        select(SelectionWeight.weight).where(
            SelectionWeight.org_id == pk_org,
            SelectionWeight.category == category,
            SelectionWeight.manufacturer == manufacturer,
            SelectionWeight.model == model,
        )
    )).scalar_one_or_none()
    return float(row or 0.0)
```

### A4: Endpoints

`backend/app/api/feedback.py` registers prefix `/api/projects/{project_id}/feedback`. Three POST routes (`/select`, `/edit`, `/negative`). All three use `require_org` from `app.middleware.org_auth`. The endpoint calls `record_decision` (and for `/select` additionally `bump_weight`).

`backend/app/api/memory_sources.py` registers prefix `/api/projects/{project_id}/memory-sources/{category}/{manufacturer}/{model}` GET only.

For `memory-sources`, return:

```python
{
    "org_pref_match": bool,  # does any org preference reference this manufacturer/family?
    "selection_weight": float,  # from selection_weights for this (org, cat, mfg, model)
    "similar_episodes_count": 0,  # placeholder; M3 will fill this
    "kb_doc_hits": 0,  # placeholder; reserved for M3 too
    "total_signals": int,
}
```

`total_signals` = (1 if org_pref_match else 0) + (1 if selection_weight > 0 else 0).

### A5: Tests

`test_api_feedback.py` — 6 cases:
1. POST /select records a decision with type=manual_select
2. POST /select also bumps selection_weights (assert weight==1 first time, 2 after two posts)
3. POST /edit with target=bom records type=bom_edit
4. POST /negative records type=thumbs_down
5. All three require X-Volta-Org-Token (401 without)
6. POST /select with invalid project_id returns 404 (or 422 — whatever your route resolves to)

`test_memory_sources.py` — 4 cases:
1. With no signals → all zeros
2. With selection_weights row → `selection_weight > 0`, `total_signals == 1`
3. With matching org_pref (`preferred_plc_family` = "S7-1200") + Siemens lookup → `org_pref_match=True`
4. Both signals present → `total_signals == 2`

Follow inline `ASGITransport`/`AsyncClient` test pattern (per M1 Track A's `test_api_orgs.py`).

### A6: Commit

```
feat(memory M2): decisions/run_history/selection_weights + feedback API + memory-sources (Track A)
```

---

## Track B — Orchestrator + selection_supervisor wiring

**Files** (4):
- Modify `backend/app/core/graph/agents.py` (`fanout_selection_supervisor` reorders candidates by weight)
- Modify `backend/app/core/orchestrator.py` (write `manual_select` decisions on resume + write `run_history` on start/end)
- Create `backend/app/core/run_history_service.py` (`start_run` + `finish_run` helpers)
- Create `backend/tests/test_run_history_capture.py`
- Create `backend/tests/test_selection_weight_bias.py`

### B1: run_history_service

```python
# backend/app/core/run_history_service.py
"""Per-analysis-run telemetry capture.

start_run() returns a UUID; the orchestrator stashes it in
AnalysisState["run_history_id"] (already nullable). finish_run()
closes it out with timings and errors. Both are best-effort — a
DB failure must not break the running graph.
"""
from datetime import datetime
from typing import Any
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RunHistory
from app.db.repository import async_session


async def start_run(project_id: str) -> str | None:
    try:
        async with async_session() as session:
            row = RunHistory(project_id=project_id, started_at=datetime.utcnow())
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return row.id
    except Exception:
        return None


async def finish_run(
    run_id: str | None,
    *,
    nodes_executed: dict[str, float] | None = None,
    errors: list[dict] | None = None,
    final_stage: str | None = None,
) -> None:
    if not run_id:
        return
    try:
        async with async_session() as session:
            await session.execute(
                update(RunHistory).where(RunHistory.id == run_id).values(
                    finished_at=datetime.utcnow(),
                    nodes_executed=nodes_executed or {},
                    errors=errors or [],
                    final_stage=final_stage,
                )
            )
            await session.commit()
    except Exception:
        pass
```

### B2: Orchestrator integration

In `backend/app/core/orchestrator.py`:

1. At start of every analysis run (in `stream_graph_analysis` / `run_graph_analysis`, right after building `initial_state`): call `run_id = await start_run(project_id)`, attach to `initial_state["run_history_id"]` (also add this field to `AnalysisState` in `state.py`).

2. While streaming events (`_stream_events`): accumulate `{node_name: elapsed_ms}` into a local dict. On graph done OR on exception, call `finish_run(run_id, nodes_executed=..., final_stage=...)`.

3. In `resume_graph_analysis`: when the user submits `manual_selections`, before re-entering the graph, iterate `manual_selections` and call `record_decision(type="manual_select", before=<interrupt_value>, after=<this_selection>, ...)` + `bump_weight(...)` per selection. Use `state.get("org_id")` from the current checkpoint to pass through.

### B3: selection_supervisor reordering

In `backend/app/core/graph/agents.py`, find `fanout_selection_supervisor`. After it produces its candidate list (likely from `graph_rag.search_components(...)` or similar), reorder by `selection_weight` descending.

Use a small helper at the top of the same file:

```python
async def _apply_org_bias(candidates: list[dict], org_id: str | None) -> list[dict]:
    """Sort candidates so org-preferred manufacturer/model come first.

    Reads selection_weights for the (org_id, category, manufacturer, model)
    tuple and adds it as a sort key. Stable on ties so existing rank order
    is preserved within the same weight bucket.
    """
    if not candidates or not org_id:
        return candidates
    from app.core.decisions_service import lookup_weight
    from app.db.repository import async_session
    async with async_session() as session:
        weights = []
        for c in candidates:
            w = await lookup_weight(
                session, org_id=org_id,
                category=c.get("component_type") or c.get("category") or "",
                manufacturer=c.get("manufacturer") or "",
                model=c.get("model") or c.get("name") or "",
            )
            weights.append(w)
    # decorate-sort-undecorate; preserve original order on ties
    indexed = sorted(
        enumerate(candidates),
        key=lambda iv: (-weights[iv[0]], iv[0]),
    )
    return [c for _, c in indexed]
```

Wire this just before the agent emits the candidate list back into state.

### B4: Tests

`test_run_history_capture.py` — 2 cases:
1. `start_run` returns UUID, row exists in DB
2. `finish_run` updates row with timings and final_stage

`test_selection_weight_bias.py` — 2 cases:
1. With weight=5 on `(org, "PLC_CPU", "Siemens", "1215C")` and candidates `[{1212C}, {1215C}, {1500}]`, `_apply_org_bias` puts `1215C` first
2. With no weights, original order preserved

### B5: Commit

```
feat(memory M2): orchestrator captures manual_select + run_history; selection biased by weights (Track B)
```

---

## Track C — Frontend: BOM "i" popover + 👎 + edit-event POSTers

**Files** (8):
- Create `frontend/src/views/components/MemorySourcePopover.tsx` (modal/popover that calls `GET /memory-sources/...`)
- Create `frontend/src/views/components/MemorySourcePopover.test.tsx`
- Create `frontend/src/services/feedback.ts` (3 typed clients: `postSelectFeedback`, `postEditFeedback`, `postNegativeFeedback`)
- Create `frontend/src/services/feedback.test.ts`
- Modify `frontend/src/views/components/BOMPanel.tsx`:
  - Add ⓘ icon button next to each BOM row that opens `MemorySourcePopover`
  - Add 👎 icon button per row that calls `postNegativeFeedback`
  - When an existing inline edit lands (if there is one — check existing code first), call `postEditFeedback`
- Modify `frontend/src/views/components/WiringPanel.tsx` (similar: if there's inline editing of wire spec or terminal, hook `postEditFeedback`)
- Modify `frontend/src/views/components/TopologyPanel.tsx` (when node-drag persist fires, call `postEditFeedback` with target="topology")

### C1: feedback client

```typescript
// frontend/src/services/feedback.ts
import { authedFetch } from './orgClient';

const base = (projectId: string) => `/api/projects/${projectId}/feedback`;

export interface SelectFeedback {
  category: string;
  manufacturer: string;
  model: string;
  before?: unknown;
  rationale?: string;
}

export async function postSelectFeedback(projectId: string, body: SelectFeedback) {
  const r = await authedFetch(`${base(projectId)}/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`select feedback ${r.status}`);
  return r.json() as Promise<{ decision_id: string; weight: number }>;
}

export interface EditFeedback {
  target: 'bom' | 'wiring' | 'topology';
  before: unknown;
  after: unknown;
  rationale?: string;
}

export async function postEditFeedback(projectId: string, body: EditFeedback) {
  const r = await authedFetch(`${base(projectId)}/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`edit feedback ${r.status}`);
  return r.json() as Promise<{ decision_id: string }>;
}

export interface NegativeFeedback {
  target: 'bom_row' | 'general';
  context: Record<string, unknown>;
  rationale?: string;
}

export async function postNegativeFeedback(projectId: string, body: NegativeFeedback) {
  const r = await authedFetch(`${base(projectId)}/negative`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`negative feedback ${r.status}`);
  return r.json() as Promise<{ decision_id: string }>;
}

export interface MemorySources {
  org_pref_match: boolean;
  selection_weight: number;
  similar_episodes_count: number;
  kb_doc_hits: number;
  total_signals: number;
}

export async function fetchMemorySources(
  projectId: string, category: string, manufacturer: string, model: string,
): Promise<MemorySources> {
  const url = `/api/projects/${projectId}/memory-sources/${encodeURIComponent(category)}/${encodeURIComponent(manufacturer)}/${encodeURIComponent(model)}`;
  const r = await authedFetch(url);
  if (!r.ok) throw new Error(`memory-sources ${r.status}`);
  return r.json();
}
```

### C2: MemorySourcePopover

A floating panel that takes `{projectId, category, manufacturer, model, onClose}` props. Fetches sources on mount, renders:

```
为什么选 {manufacturer} {model}?

📋 组织偏好    [org_pref_match ? '本组织有相关偏好' : '本组织暂无相关偏好']
🔁 历史采纳    [selection_weight 次手动选过此型号]
🧠 工程经验    [similar_episodes_count 个相似项目案例]  (M3 时填实数)
📚 知识库       [kb_doc_hits 条 RAG 命中]               (M3 时填实数)

────────────────────
[这个选错了 👎]   [关闭]
```

The 👎 button fires `postNegativeFeedback` and closes.

### C3: BOMPanel

Add an `ⓘ` button column on the left of each row. Click opens MemorySourcePopover. Also add a small 👎 inline at the right. When inline edits (if any) submit, fire `postEditFeedback({target:'bom', before: original, after: edited})`.

Look at the current BOMPanel structure first — it has a table with rows; you'll be adding two new columns. Keep the existing "采购" column and engineering-theme styles.

### C4: WiringPanel + TopologyPanel

If editing exists, hook the same edit-feedback pattern. If not, add a placeholder TODO and skip (don't fabricate UI just to have an edit hook).

### C5: Tests

`feedback.test.ts` — 4 cases: each of the three clients with mocked fetch + memorySources fetch.
`MemorySourcePopover.test.tsx` — 4 cases: renders with zero signals, renders with all signals, 👎 button POSTs, close calls `onClose`.

### C6: Commit

```
feat(memory M2): BOM 'i' popover + 👎 + edit-feedback hooks (Track C)
```

---

## Integration

- [ ] **INT-A** Parent edits `backend/app/main.py` to register `feedback.router` and `memory_sources.router`.
- [ ] **INT-B** Run alembic upgrade head (006 should land).
- [ ] **INT-C** Full pytest → expect 127 + ~14 new = 141+.
- [ ] **INT-D** tsc + vitest → expect 67 + ~12 new = 79+.
- [ ] **INT-E** Rebuild + redeploy + health check.
- [ ] **INT-F** Smoke: bootstrap org, POST a select feedback, GET memory-sources for the same triple, assert `selection_weight ≥ 1`.
- [ ] **INT-G** Commit the main.py wiring.
