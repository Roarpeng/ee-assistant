# Backend Data Channels for Blueprint UI Refresh

**Date**: 2026-05-14
**Status**: draft → in progress
**Author**: Volta
**Parent**: `2026-05-14-blueprint-ui-refresh-design.md`

## 1. Context

The P0–P3 frontend refresh (commits `36cf454` → `28f5b27`) introduced
five new visual surfaces backed by Zustand store fields:

| UI                | Store field            | Backend status today          |
|-------------------|------------------------|-------------------------------|
| `InfoPanel`       | `safetyLevel`, `bomCost` | data exists in DB, not pushed |
| `IOBudgetBar`     | `budgetItems[]`        | nothing populates             |
| `WiringPanel`     | `ioItems[]`            | nothing populates             |
| `GuidePanel`      | `commissioningSteps[]` | concept doesn't exist         |
| `ClarifyCard`     | `assistant.options`    | requirements agent emits free text only |

Result: 4 of the 5 new tabs show empty-state placeholders in production.
This spec closes those gaps end-to-end without changing the UI contract
the frontend was already designed against.

## 2. Goals

- Every new UI surface receives real data from the backend within the
  same LangGraph DAG run that produces the existing BOM / topology / code.
- No changes to the frontend store-field shapes already shipped in P0–P3
  (the frontend is the contract — backend conforms to it).
- All additions follow the existing partial-payload pattern in
  `orchestrator._NODE_PARTIAL_KEYS` — no new transport layer.
- TDD: each new agent and helper ships with `pytest` coverage. The DAG
  must still complete end-to-end (existing integration tests pass).
- Deterministic where reasonable (commissioning steps, wiring rules)
  to keep LLM cost down and behaviour predictable.

## 3. Non-Goals

- No price-database integration; `bomCost` is an order-of-magnitude
  estimate from a static catalog, clearly labelled as 估算.
- No real-time editing of wiring or commissioning steps from the UI in
  this iteration (read-only delivery; editing is P4).
- No new RAG / knowledge-base ingestion.
- No backwards-incompatible changes to existing `applyAnalysisPayload`
  semantics — additive only.

## 4. Architecture

### 4.1 Shared infrastructure (Phase 1)

`backend/app/core/plc_catalog.py` — a single source of truth for PLC
electrical specs, keyed by `order_number`. Holds:

- `capacity: {di, do_, ai, ao}` — onboard IO points
- `terminals: {di: ["DI0", "DI1", ...], do_: [...], ai: [...], ao: [...]}`
  — physical terminal labels in mounting order
- `price_cny: int` — rough estimate for `bomCost` aggregation

Catalog seeded with Siemens S7-1200 family (1211C/1212C/1214C/1215C
DC/DC/DC + AC/DC/RLY variants), S7-1500 (1511C/1513-1 PN). Falls back
to a generic 8DI/8DO model for unknown order numbers.

Also `bom_prices.py` — flat dict mapping
`(category, manufacturer_prefix)` → indicative CNY price. Used for
non-PLC line items (HMI/VFD/contactor/relay/breaker).

### 4.2 Five data channels (Phase 2)

Each channel = (a) new field in `AnalysisState`, (b) agent that
produces it, (c) entry in `_NODE_PARTIAL_KEYS`, (d) frontend
`applyAnalysisPayload` extension.

#### B1: `project_meta` — InfoPanel data

- **Producing node**: `final_review_agent` (already last in DAG)
- **New state fields**: `bom_cost: int`, `safety_level` already exists
  but is now also surfaced via partial payload
- **Computation**: walk `bom_items`, look up each line in
  `plc_catalog` or `bom_prices`, sum `unit_price * quantity`.
  Unknown items contribute 0 (clearly under-counted is honest).
- **Payload shape**: `{ project_meta: { safety_level, bom_cost } }`
- **Frontend**: new `setProjectMeta(meta)` in store; `applyAnalysisPayload`
  dispatches `state.project_meta`.

#### B2: `io_budget` — IOBudgetBar data

- **Producing node**: `rule_validator` (already runs post-selection,
  has access to both BOM and requirement)
- **New state field**: `io_budget: list[BudgetItem]`
  - one row per PLC in BOM (with `type: "plc"`, `capacity`)
  - one row per `requirement.io_list` entry (with `signal`)
- **Frontend already wires this** via `computeIOBudget(budgetItems)`
- **Payload shape**: `{ io_budget: [...] }` → frontend `setBudgetItems`

#### B3: `clarify_options` — ClarifyCard data

- **Producing node**: `requirements_agent` (when LLM returns
  ambiguous / missing critical params)
- **LLM contract change**: `analyze_requirements` prompt asks for
  `clarification: { needed: bool, groups: [{key, label, choices}] }`
  on top of the existing requirement struct. When `needed=true`,
  agent yields the chat message with `options=groups`.
- **WS message format**: existing `messages` channel gains an optional
  `options` field on assistant rows (the frontend `ClarifyCard` already
  reads `msg.options`).
- **Fallback**: deterministic detector — if `safety_level`, `environment`,
  or `plc_family` are all None after LLM extraction, synthesize a
  default `clarification` block client-side to keep the UI useful even
  when the LLM doesn't follow the new schema.

#### B4: `commissioning_steps` — GuidePanel data

- **New node**: `CommissioningStepAgent` inserted in DAG **between**
  `final_review_agent` and END (so it sees the full BOM + topology).
- **Pure deterministic** generator (no LLM). Steps composed from a
  template library keyed on BOM categories:
  - Always: 上电检查 → 接线核对 → PLC 程序下载 → IO 单元测试 → HMI/SCADA 联调 → 现场调试
  - If `VFD` in BOM: 加 "变频器参数设置 (P0003-P1080)" step
  - If `Servo_Drive`: 加 "伺服调谐与原点回归" step
  - If `safety_level in (SIL2, SIL3, PLd, PLe)`: 加 "安全回路 SISTEMA 验证" step
  - If `HMI`: 加 "HMI 触摸屏组态下载" step
  - If `Communication_Module`: 加 "现场总线网络扫描与诊断" step
- **Payload shape**: `{ commissioning_steps: [{title, body}] }` →
  frontend `setCommissioningSteps`.

#### B5: `io_items` — WiringPanel data

- **New node**: `WiringGeneratorAgent` inserted in DAG **between**
  `schematic_generator` and `final_review_agent` (after topology is
  known but before final review uses it).
- **Pure deterministic** generator. Algorithm:
  1. Find PLC in BOM → look up `terminals` from `plc_catalog`
  2. Pool of available terminals: dict keyed on signal type (DI/DO/AI/AO)
  3. For each entry in `requirement.io_list`, pop next free terminal of
     matching type, produce `{tag, signal, from, to, wire}` row:
     - `tag` = `PLC.<terminal>` (e.g. `PLC.DI0`)
     - `signal` = `io.description` (or `io.tag` fallback)
     - `from` = `X1.<n>` (sequential terminal block reference)
     - `to` = `PLC.<terminal>` (same as `tag`)
     - `wire` = wire spec by signal class:
       - `DI`/`DO`: `0.75 mm² 黑/红`
       - `AI`/`AO`: `0.5 mm² 屏蔽双绞`
       - Safety: `1.0 mm² 黄/绿`
  4. If PLC capacity exceeded for a channel, mark row with `over=true`
     (frontend can later highlight; this iteration just logs a warning).
- **Payload shape**: `{ io_items: [{tag, signal, from, to, wire}] }` →
  frontend `setIOItems`.

## 5. Testing strategy

- **Unit (pytest)**: per new module — `test_plc_catalog.py`,
  `test_bom_prices.py`, `test_wiring_generator.py`,
  `test_commissioning_generator.py`, `test_project_meta.py`,
  `test_io_budget.py`.
- **Integration (pytest)**: extend `tests/test_graph_e2e.py` to assert
  the five new fields appear in `final_state` after a sample analysis.
- **Frontend unit (vitest)**: extend `applyAnalysisPayload` tests to
  cover the five new dispatch branches.
- **Manual smoke** post-deploy: run a sample prompt, check each tab.

## 6. Risks & Mitigations

| Risk                                    | Mitigation                              |
|-----------------------------------------|-----------------------------------------|
| LLM doesn't emit `clarification` field  | Deterministic fallback in B3 catches it |
| PLC `order_number` not in catalog       | Generic 8/8/2/0 default + log warning   |
| `bom_cost` undercounts unknown items    | Label as 估算; show component count too |
| New nodes slow down DAG                 | Both new agents are pure-Python <50ms   |
| Wiring exceeds PLC capacity             | Mark rows with `over=true`; UI shows red |

## 7. Out of scope / future

- P4: bidirectional editing (user drags terminal assignments, regen wire)
- P4: real-time price API integration
- P4: BOM Excel export with prices
