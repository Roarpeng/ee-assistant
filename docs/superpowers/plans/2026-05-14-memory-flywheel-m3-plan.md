# M3 — Flywheel Stage 2 (Episodes + Consolidation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Spec**: `../specs/2026-05-14-memory-flywheel-design.md` §3.5, §3.6, §6 M3
**Branch**: `feat/blueprint-ui-refresh`
**Goal**: Cross-project memory — the system tells the selection_supervisor "the last 3 projects from this org used X / changed Y / vetoed Z", and a consolidation pass distills `decisions` rows into a weekly report.

**M3 scope (this plan)**:
- ✅ `episodic_memories` table + capture after analysis done
- ✅ `weekly_memory_report` table + on-demand consolidation endpoint
- ✅ SelectionSupervisor reads top-3 most-recent org episodes, summarizes into prompt context
- ✅ Frontend "记忆" tab in OrgSettingsPanel (episode list + report list + 立即整合 button)

**Explicitly deferred to M3.5 / M3.6** (noted here so reviewers know they're known gaps, not oversights):
- Qdrant `ee_episodes` vector collection + hybrid search (current retrieval is `ORDER BY created_at DESC LIMIT 3` filtered by org_id — useful but coarse)
- Periodic cron / Celery beat schedule for sleep-time consolidation (today an admin must POST `/consolidate-memory`; the endpoint exists, the cron does not)
- LLM-based episode summarization (today the extractor is template-based deterministic — accurate but rigid)

Each deferred item is small enough to be its own follow-up plan and orthogonal to M3's core contract.

**Pre-assigned alembic revision**: `007_episodic_memories_and_reports` (one migration that covers both new tables to avoid extra revision chains; both are M3-scope and conceptually paired).

**Frozen schemas**:

```python
class EpisodicMemory(Base):
    __tablename__ = "episodic_memories"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    org_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=True, index=True)
    requirement_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    bom_snapshot: Mapped[list] = mapped_column(JSON, default=list)
    key_decisions: Mapped[list] = mapped_column(JSON, default=list)   # [{cat, before, after, rationale}, ...]
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    embedding_id: Mapped[str | None] = mapped_column(String(64), nullable=True)  # Qdrant point id, reserved for M3.6
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class WeeklyMemoryReport(Base):
    __tablename__ = "weekly_memory_reports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=True, index=True)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    new_rules: Mapped[list] = mapped_column(JSON, default=list)        # [{cat, manufacturer, model, occurrences}, ...]
    revisions: Mapped[list] = mapped_column(JSON, default=list)        # [{cat, deprecated_model, replaced_by, occurrences}, ...]
    gaps: Mapped[list] = mapped_column(JSON, default=list)              # [{cat, context, occurrences}, ...] from thumbs_down
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)           # {episodes_extracted, decisions_scanned, ...}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
```

**Frozen REST contract**:
- `POST /api/admin/consolidate-memory` (require_org; body: `{days?: int = 7}`) → 201 `{report_id, summary: {new_rules, revisions, gaps, metrics}}`
- `GET /api/orgs/me/episodes?limit=20&offset=0` → 200 `list[EpisodeOut]`
- `GET /api/orgs/me/memory-reports?limit=10` → 200 `list[ReportOut]`

---

## Track A — Capture (table + extractor + trigger)

**Files** (7):
- Create `backend/alembic/versions/007_episodic_memories_and_reports.py`
- Modify `backend/app/db/models.py` (append `EpisodicMemory` + `WeeklyMemoryReport`)
- Modify `backend/app/core/schemas.py` (append `EpisodeOut` + `ReportOut`)
- Create `backend/app/core/episode_extractor.py` (deterministic template-based summarizer)
- Modify `backend/app/core/orchestrator.py` (call extractor on graph done; best-effort)
- Create `backend/app/api/episodes.py` (GET `/api/orgs/me/episodes`)
- Create `backend/tests/test_episode_extractor.py`
- Create `backend/tests/test_api_episodes.py`

### A1: Migration

`007_episodic_memories_and_reports.py`, `down_revision="006_decisions_runhistory_weights"`. Two `op.create_table` calls (episodic_memories, weekly_memory_reports). Reverse on downgrade.

### A2: Models — per the frozen schemas above. Verify `Float`, `Text` are imported in `models.py` (M2 Track A added them).

### A3: Schemas — Pydantic shapes:

```python
class EpisodeOut(BaseModel):
    id: str
    project_id: str
    org_id: str | None
    summary: str
    key_decisions: list[dict]
    score: float
    created_at: datetime
    class Config: from_attributes = True


class ReportOut(BaseModel):
    id: str
    org_id: str | None
    period_start: datetime
    period_end: datetime
    new_rules: list[dict]
    revisions: list[dict]
    gaps: list[dict]
    metrics: dict
    created_at: datetime
    class Config: from_attributes = True
```

### A4: Extractor (`episode_extractor.py`)

Deterministic template based on the final AnalysisState. Pseudocode:

```python
"""Extract a one-line summary + structured key_decisions from a finished
AnalysisState. Deterministic template — no LLM dependency."""
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import EpisodicMemory, Decision
from app.db.repository import async_session


def _summarize(req: dict, bom: list[dict], decisions: list[dict]) -> str:
    """One-line natural summary."""
    machine = (req or {}).get("machine_type") or "项目"
    safety = (req or {}).get("safety_level")
    plc_models = [b.get("model") for b in (bom or []) if b.get("category") == "PLC_CPU"]
    plc_part = f"用 {', '.join(plc_models)}" if plc_models else ""
    manual_count = sum(1 for d in decisions if d.get("type") == "manual_select")
    edit_count = sum(1 for d in decisions if "edit" in d.get("type", ""))
    safety_part = f" ({safety})" if safety else ""
    extras = []
    if manual_count: extras.append(f"{manual_count} 处手动选型")
    if edit_count: extras.append(f"{edit_count} 处编辑")
    extra_part = "; ".join(extras)
    return f"{machine}{safety_part} {plc_part}{(' — ' + extra_part) if extra_part else ''}".strip()


def _key_decisions(decisions: list[dict]) -> list[dict]:
    """Distil manual_select + bom_edit rows into compact form."""
    out = []
    for d in decisions:
        t = d.get("type")
        if t == "manual_select":
            out.append({
                "cat": (d.get("after") or {}).get("category"),
                "before": (d.get("before") or {}).get("model"),
                "after": (d.get("after") or {}).get("model"),
                "rationale": d.get("rationale"),
                "type": t,
            })
        elif "edit" in (t or ""):
            out.append({"type": t, "rationale": d.get("rationale")})
    return out


async def extract_and_store_episode(project_id: str, org_id: str | None, final_state: dict) -> str | None:
    """Best-effort: writes an EpisodicMemory row from the final AnalysisState
    + all decisions captured during this run. Returns the new episode id,
    or None on failure (caller must not raise — telemetry-style)."""
    try:
        req = (final_state or {}).get("requirement") or {}
        bom = (final_state or {}).get("bom_items") or []
        async with async_session() as session:
            # Decisions for this project, this run window — for simplicity
            # we grab every decision row for the project (small N).
            rows = (await session.execute(
                select(Decision).where(Decision.project_id == project_id)
            )).scalars().all()
            decisions = [{
                "type": r.type, "before": r.before, "after": r.after,
                "rationale": r.rationale, "context": r.context,
            } for r in rows]
            summary = _summarize(req, bom, decisions)
            key_decisions = _key_decisions(decisions)
            score = min(1.0, 0.4 + 0.1 * len(key_decisions))  # more decisions → higher quality signal
            ep = EpisodicMemory(
                project_id=project_id, org_id=org_id,
                requirement_snapshot=req, bom_snapshot=bom,
                key_decisions=key_decisions, summary=summary,
                score=score,
            )
            session.add(ep)
            await session.commit()
            await session.refresh(ep)
            return ep.id
    except Exception:
        return None
```

### A5: Orchestrator hook

In `backend/app/core/orchestrator.py`'s `_stream_events`, where M2-B already calls `finish_run(...)` on done: add a call to `extract_and_store_episode(project_id, org_id, final_state)` immediately after `finish_run`. Both are best-effort. Use the same `try/except` wrapping pattern.

(The shared `_lookup_project_org_id` helper from M1-B is reusable here if you need org_id and didn't already capture it.)

### A6: Episodes endpoint

`backend/app/api/episodes.py` registers `GET /api/orgs/me/episodes` — same shape as the org_preferences listing. Requires `Depends(require_org)`. Supports query params `limit` (default 20, max 100) and `offset` (default 0). Order by `created_at DESC`.

### A7: Tests

`test_episode_extractor.py` — 3 cases: extractor produces a non-empty summary for a populated state; returns None on bare/empty state; key_decisions extracts manual_select correctly.

`test_api_episodes.py` — 3 cases: GET with no episodes returns []; GET after seeding 1 episode returns 1 item with org_id filter applied; missing token returns 401.

### A8: Commit

`feat(memory M3): episodic_memories table + capture + episodes API (Track A)` — stage only your 8 files.

---

## Track B — Retrieval + Consolidation

**Files** (5):
- Create `backend/app/core/episode_retrieval.py` (SQL-based top-N retrieval by org_id + recency, with optional machine_type filter)
- Create `backend/app/core/consolidation_service.py` (scan decisions in past N days → emit candidate rules + revisions + gaps; persist as `WeeklyMemoryReport`)
- Create `backend/app/api/admin_memory.py` (`POST /api/admin/consolidate-memory` + `GET /api/orgs/me/memory-reports`)
- Modify `backend/app/core/graph/agents.py` (`fanout_selection_supervisor`: fetch top-3 episodes, format as a Chinese context block, inject into the agent's LLM prompt OR into state for downstream visibility — pick whichever is least invasive given the current prompt-assembly code)
- Create `backend/tests/test_episode_retrieval.py`
- Create `backend/tests/test_consolidation_service.py`
- Create `backend/tests/test_api_admin_memory.py`

### B1: Retrieval

```python
# episode_retrieval.py
"""Fetch top-N episodes for an org, with optional machine_type
filter. SQL-only for M3.0; M3.6 will add Qdrant hybrid search."""
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import EpisodicMemory


async def top_episodes(
    session: AsyncSession,
    org_id: str | None,
    machine_type: str | None = None,
    limit: int = 3,
) -> list[EpisodicMemory]:
    """Return up to `limit` recent episodes for this org (NULL-org acts
    as 'global' fallback if org_id is None). When machine_type is set,
    prefer episodes that match — but still fall back to recent any-type
    episodes if no match found (so a brand-new org with no exact match
    still gets some context)."""
    if not org_id:
        return []
    base = select(EpisodicMemory).where(EpisodicMemory.org_id == org_id)
    if machine_type:
        # First try: exact machine_type match
        primary = (await session.execute(
            base.where(EpisodicMemory.requirement_snapshot["machine_type"].as_string() == machine_type)
                .order_by(EpisodicMemory.created_at.desc()).limit(limit)
        )).scalars().all()
        if primary:
            return list(primary)
    rows = (await session.execute(
        base.order_by(EpisodicMemory.created_at.desc()).limit(limit)
    )).scalars().all()
    return list(rows)


def format_for_prompt(episodes: list[EpisodicMemory]) -> str:
    """Render to a Chinese natural-language block that drops cleanly
    into the selection supervisor's prompt."""
    if not episodes:
        return ""
    lines = ["[历史相似项目经验]"]
    for i, ep in enumerate(episodes, 1):
        s = ep.summary or "(无摘要)"
        kd_count = len(ep.key_decisions or [])
        lines.append(f"{i}. {s} (评分 {ep.score:.2f}, {kd_count} 处关键决策)")
    lines.append("请参考以上经验做选型。")
    return "\n".join(lines)
```

### B2: Wire into selection_supervisor

In `agents.py` `fanout_selection_supervisor`, AFTER the existing `_apply_org_bias` injection (M2-B added it) but BEFORE the LLM prompt is built: fetch top-3 episodes via the helpers above, append the formatted block to whatever context the supervisor passes to the LLM. If the supervisor doesn't currently call an LLM (look at the code first — it may be pure heuristic), put the formatted text into a new `state["episodic_context"]` field so it's at least visible in `done`-payload and the frontend can render it later. Add `episodic_context: str | None` to `AnalysisState` in `state.py`.

### B3: Consolidation

```python
# consolidation_service.py
"""Sleep-time consolidation MVP (M3.0):
- scan decisions in past N days for the given org
- count repeated (cat, manufacturer, model) tuples in manual_selects
  → ≥ 3 occurrences = candidate `new_rule`
- count edits-against-the-same-system-suggestion → `revisions`
- count thumbs_down rows → `gaps`
- write one WeeklyMemoryReport row + return summary

NO automatic writeback to component_graph today — that's a separate
trust threshold conversation (spec §3.6). All rules go to the report
for human-in-the-loop review."""
from collections import Counter
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Decision, WeeklyMemoryReport

MIN_RULE_OCCURRENCES = 3


async def consolidate(session: AsyncSession, org_id: str | None, days: int = 7) -> WeeklyMemoryReport:
    now = datetime.utcnow()
    period_start = now - timedelta(days=days)
    q = select(Decision).where(Decision.created_at >= period_start)
    if org_id:
        q = q.where(Decision.org_id == org_id)
    rows = (await session.execute(q)).scalars().all()

    selects = Counter()
    edits = Counter()
    negatives = Counter()
    for r in rows:
        after = r.after or {}
        if r.type == "manual_select":
            key = (after.get("category", ""), after.get("manufacturer", ""), after.get("model", ""))
            if all(key):
                selects[key] += 1
        elif r.type.endswith("_edit"):
            target = (r.context or {}).get("target") or r.type
            edits[target] += 1
        elif r.type == "thumbs_down":
            ctx = r.context or {}
            key = (ctx.get("category", ""), ctx.get("manufacturer", ""), ctx.get("model", ""))
            if any(key):
                negatives[key] += 1

    new_rules = [
        {"cat": cat, "manufacturer": mfg, "model": model, "occurrences": n}
        for (cat, mfg, model), n in selects.items()
        if n >= MIN_RULE_OCCURRENCES
    ]
    revisions = [{"target": t, "occurrences": n} for t, n in edits.items()]
    gaps = [
        {"cat": cat, "manufacturer": mfg, "model": model, "occurrences": n}
        for (cat, mfg, model), n in negatives.items()
    ]
    metrics = {
        "decisions_scanned": len(rows),
        "candidate_rules": len(new_rules),
        "revisions_seen": sum(edits.values()),
        "gaps_flagged": sum(negatives.values()),
    }

    report = WeeklyMemoryReport(
        org_id=org_id, period_start=period_start, period_end=now,
        new_rules=new_rules, revisions=revisions, gaps=gaps, metrics=metrics,
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)
    return report
```

### B4: Endpoints

`backend/app/api/admin_memory.py`:

```python
@router.post("/api/admin/consolidate-memory")
async def consolidate_now(body: ConsolidateIn, org: Organization = Depends(require_org), session: ...):
    report = await consolidate(session, org.id, days=body.days or 7)
    return {"report_id": report.id, "summary": {...}}


@router.get("/api/orgs/me/memory-reports", response_model=list[ReportOut])
async def list_reports(limit: int = 10, org: Organization = Depends(require_org), session: ...):
    rows = (await session.execute(
        select(WeeklyMemoryReport).where(WeeklyMemoryReport.org_id == org.id)
        .order_by(WeeklyMemoryReport.created_at.desc()).limit(limit)
    )).scalars().all()
    return rows
```

### B5: Tests

`test_episode_retrieval.py` — 3 cases: empty org returns []; org with 5 episodes returns top-3 by recency; machine_type filter narrows the result set.

`test_consolidation_service.py` — 3 cases: ≥3 same selects → new_rule emitted; thumbs_down → gap emitted; no rows → empty report with zero metrics.

`test_api_admin_memory.py` — 3 cases: POST creates report and persists; GET returns most recent first; auth required.

### B6: Commit

`feat(memory M3): episode retrieval into supervisor + consolidation report (Track B)`.

---

## Track C — Frontend memory tab

**Files** (5):
- Create `frontend/src/services/memory.ts` (typed clients: `fetchEpisodes`, `fetchReports`, `consolidateNow`)
- Create `frontend/src/services/memory.test.ts`
- Create `frontend/src/views/components/MemoryTab.tsx` (rendered inside OrgSettingsPanel as a new section)
- Create `frontend/src/views/components/MemoryTab.test.tsx`
- Modify `frontend/src/views/components/OrgSettingsPanel.tsx` (add a tab switcher: "偏好" | "记忆"; render `MemoryTab` for the second)

### C1: Service

`memory.ts` exports:

```typescript
import { authedFetch } from './orgClient';

export interface Episode {
  id: string;
  project_id: string;
  org_id: string | null;
  summary: string;
  key_decisions: Array<Record<string, unknown>>;
  score: number;
  created_at: string;
}
export interface Report {
  id: string;
  period_start: string;
  period_end: string;
  new_rules: Array<Record<string, unknown>>;
  revisions: Array<Record<string, unknown>>;
  gaps: Array<Record<string, unknown>>;
  metrics: Record<string, number>;
  created_at: string;
}

export async function fetchEpisodes(limit = 20, offset = 0): Promise<Episode[]> {
  const r = await authedFetch(`/api/orgs/me/episodes?limit=${limit}&offset=${offset}`);
  if (!r.ok) throw new Error(`fetchEpisodes ${r.status}`);
  return r.json();
}
export async function fetchReports(limit = 10): Promise<Report[]> {
  const r = await authedFetch(`/api/orgs/me/memory-reports?limit=${limit}`);
  if (!r.ok) throw new Error(`fetchReports ${r.status}`);
  return r.json();
}
export async function consolidateNow(days = 7): Promise<{report_id: string; summary: any}> {
  const r = await authedFetch('/api/admin/consolidate-memory', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({days}),
  });
  if (!r.ok) throw new Error(`consolidateNow ${r.status}`);
  return r.json();
}
```

### C2: MemoryTab

Layout:

```
┌─ 记忆 ──────────────────────────────────────────┐
│ 工程经验  (最近 20)                              │
│ ┌─────────────────────────────────────────────┐ │
│ │ 2026-05-14  滑台 (SIL2) 用 CPU 1215C — 2手选 │ │
│ │ 2026-05-13  传送带  ...                       │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ 周报  [立即整合]                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ 2026-05-14 → 2026-05-07                      │ │
│ │   候选规则 3 条 · 修订 5 次 · 缺口 1 条       │ │
│ │   ▸ 展开详情                                  │ │
│ └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

On mount, fetch episodes + reports. "立即整合" button triggers `consolidateNow(7)` then re-fetches reports + shows a toast.

Expandable detail row per report renders `new_rules`/`revisions`/`gaps` arrays as small tables.

### C3: OrgSettingsPanel tab switcher

Currently OrgSettingsPanel renders a single content area. Add a two-tab header (偏好/记忆) using a local `useState<'preferences' | 'memory'>('preferences')`. Body renders accordingly.

### C4: Tests

`memory.test.ts` — 3 cases (each helper with mocked fetch).

`MemoryTab.test.tsx` — 4 cases: empty state, populated episodes, populated reports, "立即整合" calls API and refreshes.

### C5: Commit

`feat(memory M3): memory tab — episodes list + weekly report + consolidate-now (Track C)`.

---

## Integration

- [ ] **INT-A** Parent registers `episodes.router` + `admin_memory.router` in `main.py`.
- [ ] **INT-B** `alembic upgrade head` applies 007.
- [ ] **INT-C** Full pytest: 141 + ~15 new = 156+.
- [ ] **INT-D** tsc + vitest: 79 + ~10 new = 89+.
- [ ] **INT-E** Rebuild + redeploy + health.
- [ ] **INT-F** Smoke: create org, run consolidate-memory (empty result is fine), GET /episodes (empty), GET /memory-reports (1 row).
- [ ] **INT-G** graphify update + commit.
- [ ] **INT-H** Final M3 summary.
