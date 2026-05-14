# Blueprint-Inspired UI Refresh — Design Spec

**Date:** 2026-05-14
**Status:** Approved (chat-level approval; written here for record)
**Branch:** `feat/blueprint-ui-refresh`

## 1. Background

The user compared `https://www.blueprint.am/` (an AI hardware-design tool for
makers/hobbyists) with the current Volta frontend and asked us to borrow the
parts of Blueprint's UI that are working well — without diluting Volta's
professional industrial-automation positioning (PLC, ST code, safety levels).

The agreed plan (chat transcript on 2026-05-14, message containing the
"建议的落地优先级" table) is reproduced here as four priority tiers, P0 → P3.

## 2. Goals & Non-Goals

### Goals

1. Lower the cognitive load of the first-run experience (replace the
   "everything-open" three-pane layout for a fresh user).
2. Adopt an "engineering blueprint" visual identity (less SaaS-soft, more
   electrical-drawing).
3. Extend the canvas tab system from 3 → 6 tabs so the deliverable matches
   what an EE actually hands over (overview / topology / wiring / BOM / code /
   commissioning).
4. Turn LangGraph's clarification turns from free-text into structured
   multiple-choice cards.
5. Give users a "from template" entry point (industry baseline projects).
6. Surface procurement deep-links on BOM rows.
7. Show a control-cabinet 2D top-view derived from BOM.
8. Surface the rule engine's I/O budget live during selection.

### Non-Goals

- Public community / UGC features.
- Full 3D mechanical view.
- Replacing existing professional workflows (rule engine, knowledge graph,
  human-in-the-loop selection) — those stay as Volta's moat.
- Mobile / responsive design (desktop EE workstation is the target).

## 3. Scope Tiers

| Tier | Theme | Tasks |
|---|---|---|
| P0 | First-impression visual rebrand | (a) engineering theme + tighten radii  (b) HeroLanding for empty state  (c) wireframe topology nodes |
| P1 | Deliverable package: more tabs + structured clarify | (a) InfoPanel  (b) WiringPanel  (c) GuidePanel  (d) tab routing  (e) structured clarify cards |
| P2 | Templates + Procurement | (a) industry template registry  (b) "from template" UI  (c) BOM procurement deep-link column |
| P3 | Constraint visualisation | (a) cabinet 2D top-view SVG  (b) live I/O budget bar |

## 4. Architecture Decisions

### 4.1 Test runner

Frontend currently has no test runner; only `tsc --noEmit && vite build` is
used for verification. To honour CLAUDE.md's "TDD: 先写测试" rule for the
logic-heavy pieces of this work, we add **vitest** as a devDependency in P0
setup (before any other task). Pure-visual changes still rely on
`tsc --noEmit && vite build` as their GREEN evidence — that's an explicit
exception because the alternative (snapshot tests for styling) is brittle and
gives no design-quality signal.

### 4.2 Engineering theme

We add a new third theme `engineering` alongside `light` / `dark`. It is dark
by default (EEs prefer dark in the workshop) and differs from the existing
`dark` theme in:
- `--color-accent: #4ec9ff` (blueprint blue, not indigo)
- All `--radius-*` cut by ~50 % (12 px → 6 px, 2.5 rem mega-radius → 0.75 rem)
- Adds `--color-grid` for the dot-grid canvas background

The existing `light` / `dark` themes remain untouched so this is purely
additive.

### 4.3 HeroLanding routing

`App.tsx` decides between `<HeroLanding />` and `<AppLayout />` based on
`useStore().project`. When the user submits a prompt or picks a template, we
call the existing `newProject({ preserveCanvas: false })` flow with the prompt
pre-loaded into chat input — no new backend route.

### 4.4 Tab system expansion

`AppLayout.tsx` already drives canvas content through `activeCanvasTab`
(string union `'topology' | 'bom' | 'code'`). We extend the union to
`'info' | 'topology' | 'wiring' | 'bom' | 'code' | 'guide'` and wire three new
panels. Old payload shapes from the LangGraph DAG carry enough information
already (project metadata for INFO, BOM has wiring hints, ST code has
commissioning notes) — if a field is absent the panel shows an empty state, no
backend changes are required for the first iteration.

### 4.5 Structured clarify cards

When an assistant message contains `options: { key, label, choices[] }[]`,
`ChatPanel` renders chip-pickers instead of plain text. This is purely a
frontend renderer change — the backend can start emitting `options` later. We
include a backwards-compatible fallback: messages without `options` render as
today.

### 4.6 Template registry

`frontend/src/services/templates.ts` exposes
`listTemplates()` / `loadTemplate(id)`. Templates are static JSON in
`frontend/src/services/templates/*.json` for now (no backend round-trip). Each
template is a partial project state: pre-filled chat seed message, optional
seed BOM, optional seed topology. The user can then ask the LangGraph DAG to
finish it.

### 4.7 BOM procurement deep-links

`frontend/src/services/procurement.ts` exports `buildProcurementUrl(item)`. We
support 3 source kinds: `siemens` / `schneider` / `generic`. The generic kind
deep-links to 工控168 / 震坤行 search by MPN (no API account needed). The
column appears in `BOMPanel` as an external-link icon — no data model change
required; we synthesise the URL from `manufacturer` + `model` already in the
BOM row.

### 4.8 Cabinet 2D layout

`frontend/src/views/components/CabinetPanel.tsx` reads the BOM, estimates each
component's footprint (lookup table keyed by component type), and lays out
items on a 600 × 800-mm cabinet grid using a simple shelf-packing algorithm.
This is added as a 7th tab `cabinet` *behind* the P3 feature flag — it is the
last task and skippable if scope pressure hits.

### 4.9 Live I/O budget bar

`frontend/src/services/budget.ts` exports `computeIOBudget(bom)` returning
`{ di, do_, ai, ao }` consumed vs PLC ceiling. The bar renders on
`TopologyPanel` as a thin strip below the canvas header. If no PLC is in the
BOM the bar hides.

## 5. File Map

New files:
- `frontend/vitest.config.ts`
- `frontend/src/test/setup.ts`
- `frontend/src/views/components/HeroLanding.tsx` + test
- `frontend/src/views/components/InfoPanel.tsx` + test
- `frontend/src/views/components/WiringPanel.tsx` + test
- `frontend/src/views/components/GuidePanel.tsx` + test
- `frontend/src/views/components/CabinetPanel.tsx` + test
- `frontend/src/views/components/ClarifyCard.tsx` + test
- `frontend/src/views/components/IOBudgetBar.tsx`
- `frontend/src/services/templates.ts` + test
- `frontend/src/services/templates/water-treatment.json`
- `frontend/src/services/templates/packaging-line.json`
- `frontend/src/services/templates/conveyor-vfd.json`
- `frontend/src/services/procurement.ts` + test
- `frontend/src/services/budget.ts` + test
- `docs/superpowers/specs/2026-05-14-blueprint-ui-refresh-design.md` (this file)
- `docs/superpowers/plans/2026-05-14-blueprint-ui-refresh-plan.md`

Modified files:
- `frontend/package.json` (add vitest, jsdom, @testing-library/react)
- `frontend/tsconfig.json` (include vitest types)
- `frontend/src/index.css` (add `[data-theme="engineering"]` block)
- `frontend/src/App.tsx` (HeroLanding gate)
- `frontend/src/views/components/AppLayout.tsx` (tab union, less mega-radius)
- `frontend/src/views/components/ThemeToggle.tsx` (3-way toggle)
- `frontend/src/views/components/CustomNodes.tsx` (wireframe stroke style)
- `frontend/src/views/components/TopologyPanel.tsx` (mount IOBudgetBar, dot grid)
- `frontend/src/views/components/BOMPanel.tsx` (procurement column)
- `frontend/src/views/components/ChatPanel.tsx` (ClarifyCard renderer)
- `frontend/src/views/components/ConversationSidebar.tsx` (template entry)
- `frontend/src/models/store.ts` (extend `activeCanvasTab` union; `theme` union)
- `frontend/src/services/i18n.ts` (new tab labels)

## 6. Testing Strategy

| Layer | Tool | Rule |
|---|---|---|
| Pure logic (procurement, budget, templates) | vitest | strict RED → GREEN → REFACTOR |
| Component logic (HeroLanding submit, ClarifyCard pick) | vitest + @testing-library/react | RED → GREEN |
| Visual (theme variables, wireframe nodes, dot grid) | `tsc --noEmit && vite build` | build-passes is the GREEN |
| Full build | `npx tsc --noEmit && npx vite build` | run once at each commit |

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| TopologyPanel is 27 KB / 700+ lines — refactor risk | Only swap node renderers and add IOBudgetBar mount point; do not restructure |
| ChatPanel is 21 KB — render path complex | Add ClarifyCard as a pure leaf renderer guarded by `msg.options` truthy check, no flow changes |
| Adding vitest pulls JSDOM into prod build | Use `devDependencies` only; vite ignores test files via default include glob |
| Cabinet layout footprint table is incomplete | Ship with the 8 most-common types; unknown types render as a grey 50 × 50 mm placeholder |
| Procurement deep-links may break if vendor changes URL schema | Each builder is one pure function, easy to fix; tests cover the happy paths |

## 8. Out of Scope (Explicitly)

- Translating Volta's existing copy into Blueprint's tone (we keep our voice).
- Removing the dark/light themes (we **add** engineering, not replace).
- Changing the LangGraph DAG.
- Changing any backend route or DB schema.

## 9. Approval

User explicitly approved the P0–P3 plan in chat on 2026-05-14
("按照你的计划从 P0 开始依次执行到 P3"). This spec is the written record of
that approval.
