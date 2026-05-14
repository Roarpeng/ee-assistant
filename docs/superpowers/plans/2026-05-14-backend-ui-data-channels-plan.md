# Backend UI Data Channels — Implementation Plan

**Spec**: `../specs/2026-05-14-backend-ui-data-channels-design.md`
**Branch**: `feat/blueprint-ui-refresh` (continuation, same branch)
**TDD**: each task RED → GREEN → REFACTOR with pytest, unless purely
data-shape additive (then `pytest + vite build`).

## Task ordering (smallest first, value-dense first)

### Phase 1 — Foundation

#### T1: `plc_catalog.py`
- **RED**: `tests/test_plc_catalog.py` — assert `lookup("6ES7212-1AE40-0XB0")`
  returns dict with `capacity={di:8, do_:6, ai:2, ao:0}` and matching
  `terminals` lists. Assert unknown order_number → generic default.
- **GREEN**: build module with 6+ Siemens entries + fallback.
- Commit: `feat(backend): PLC capacity & terminal catalog (Siemens S7-1200/1500)`

#### T2: `bom_prices.py`
- **RED**: `tests/test_bom_prices.py` — assert `estimate({category:"PLC_CPU",
  manufacturer:"Siemens"})` returns >0 int, unknown category → 0.
- **GREEN**: flat dict + lookup helper.
- Commit: `feat(backend): indicative BOM prices for cost estimation`

### Phase 2 — Five data channels

#### B1: `project_meta` (InfoPanel)

##### T3: `compute_project_meta(state)` pure function
- **RED**: `tests/test_project_meta.py` — given fake state with 3 BOM items
  + `safety_level="SIL2"`, returns `{safety_level:"SIL2", bom_cost:<sum>}`.
- **GREEN**: implement in `agents.py` or new `meta.py`.

##### T4: Wire into `final_review_agent`
- Append `project_meta` to its return dict.
- Add `project_meta` to `AnalysisState`.
- Add `final_review_agent → ("project_meta", "review_notes")` in
  `_NODE_PARTIAL_KEYS`.

##### T5: Frontend dispatch
- Extend `applyAnalysisPayload`: `if (state.project_meta) store.setProjectMeta(...)`.
- Add `setProjectMeta` to store.
- Verify with `vitest` snapshot of the dispatch logic.
- Commit: `feat(graph): project_meta partial → InfoPanel (B1)`

#### B2: `io_budget` (IOBudgetBar)

##### T6: `compute_io_budget(bom, io_list)` pure function
- **RED**: `tests/test_io_budget.py` — assert returns list with one PLC
  row (capacity dict) + one row per IO list entry (signal field set).
- **GREEN**: implement (uses `plc_catalog.lookup`).

##### T7: Wire into `rule_validator` + frontend
- Add `io_budget` to state, populate in `rule_validator`, register
  in `_NODE_PARTIAL_KEYS`.
- Frontend `applyAnalysisPayload`: dispatch to `setBudgetItems`.
- Commit: `feat(graph): io_budget partial → IOBudgetBar (B2)`

#### B3: `clarify_options` (ClarifyCard)

##### T8: Prompt update + schema
- Update `llm_service.analyze_requirements` prompt + Pydantic to
  include `clarification: {needed, groups}`.
- **RED**: `tests/test_llm_service.py` — mock LLM returns clarification
  block, parser preserves it.
- **GREEN**: extend `RequirementSchema`.

##### T9: Emit chat message with `options`
- In `requirements_agent`, if `clarification.needed=true`, append an
  assistant message with `options=clarification.groups` to `messages`.
- Add deterministic fallback: when LLM doesn't include clarification
  AND `safety_level/environment` both missing, synthesize default
  groups.
- Commit: `feat(graph): structured clarification → ClarifyCard (B3)`

#### B4: `commissioning_steps` (GuidePanel)

##### T10: `generate_commissioning_steps(bom, req)` pure function
- **RED**: `tests/test_commissioning_generator.py` — given BOM with VFD,
  output includes "变频器参数" step; without VFD doesn't.
- **GREEN**: implement deterministic template logic.

##### T11: New `commissioning_generator` node
- Insert into DAG **between** `final_review_agent` and END.
  (Updates `builder.py`.)
- Adds `commissioning_steps` to state.
- Register `commissioning_generator → ("commissioning_steps",)` in
  `_NODE_PARTIAL_KEYS`.
- Frontend dispatch to `setCommissioningSteps`.
- Commit: `feat(graph): commissioning step generator → GuidePanel (B4)`

#### B5: `io_items` (WiringPanel)

##### T12: `generate_wiring(bom, req)` pure function
- **RED**: `tests/test_wiring_generator.py` — given BOM with S7-1212C
  (8DI/6DO) and io_list of 3 DI + 2 DO, returns 5 rows with `tag`
  starting at `PLC.DI0`/`PLC.DO0` and wire colours by class.
  Asserts over-capacity case marks `over=true`.
- **GREEN**: implement.

##### T13: New `wiring_generator` node
- Insert in DAG **between** `schematic_generator` and `final_review_agent`.
- Adds `io_items` to state.
- Register `wiring_generator → ("io_items",)` in `_NODE_PARTIAL_KEYS`.
- Frontend dispatch.
- Commit: `feat(graph): wiring generator → WiringPanel (B5)`

### Phase 3 — Verify & ship

#### T14: Integration test
- Extend `tests/test_graph_e2e.py` (or add) to run a tiny prompt
  through the full DAG and assert all five new fields present in
  the final state.
- Run `pytest backend/tests -v` end-to-end GREEN.

#### T15: `graphify update .`
- Refresh knowledge graph.
- Commit graph artefacts.

#### T16: Redeploy
- `docker compose build backend && docker compose up -d --no-deps backend`
- Smoke: hit /api/health, run sample prompt, verify all 5 tabs populated.

## Definition of Done

- All commits pass `pytest backend/tests -v` GREEN.
- All commits pass `cd frontend && npx tsc --noEmit && npx vitest run` GREEN.
- `docker compose ps` shows all 5 services Up.
- Manual smoke: starting from HeroLanding with one of the example
  prompts, all six canvas tabs (info/topology/wiring/bom/code/guide
  + cabinet) show non-empty content.

## Rollback

If any agent breaks the DAG mid-flight:
- The DAG checkpoint (MemorySaver) lets us reset to before the new
  node by clearing the project's thread state.
- Each phase commits independently; revert to last green commit
  via `git revert <sha>` without touching others.
