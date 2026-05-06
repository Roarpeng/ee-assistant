# EE Assistant / Volta Project Summary and Test Optimization

**Date:** 2026-05-06  
**Branch target:** `cursorCode`  
**Status:** Project direction consolidated; first topology-source-of-truth task implemented.

## 1. Product Direction Summary

Volta should evolve from a generic LLM-assisted BOM generator into an electrical engineering design workspace:

```text
natural language / requirement documents
  -> structured requirements
  -> functional units
  -> electrical design patterns
  -> editable topology
  -> confirmed topology
  -> BOM / IO / ST code / export package
  -> engineering memory commit
  -> future retrieval and reuse
```

The central design rule is:

```text
Topology is the source of truth.
BOM, IO lists, ST/SCL code, exports, and memory commits are derived from confirmed topology.
```

This direction is captured in:

- `docs/superpowers/specs/2026-05-06-volta-engineering-memory-flywheel-design.md`
- `docs/superpowers/plans/2026-05-06-engineering-memory-flywheel-implementation-plan.md`

## 2. Current Branch Summary

This branch includes three major groups of work.

### 2.1 LLM-style conversation workspace

Implemented:

- Searchable conversation history.
- Automatic conversation titles.
- New-session options:
  - clear canvas and start fresh;
  - keep current canvas and continue discussion.
- Faster project chat endpoint:
  - `POST /api/projects/{project_id}/chat`
  - uses history and canvas context;
  - validates output before returning final user-visible content.
- Frontend routing:
  - full first-pass engineering generation still uses LangGraph;
  - follow-up conversation and canvas discussion use the faster chat path.

Key files:

- `backend/app/core/chat_orchestrator.py`
- `backend/app/api/analysis.py`
- `frontend/src/views/components/ChatPanel.tsx`
- `frontend/src/views/components/ConversationSidebar.tsx`
- `frontend/src/services/conversations.ts`

### 2.2 Engineering memory flywheel design

The design proposes seven first-class memory categories:

| Memory type | Purpose |
|-------------|---------|
| `user_preference` | User defaults and design preferences |
| `project_case` | Completed/exported project cases |
| `function_pattern` | Reusable electrical/mechatronic design patterns |
| `standard_rule` | Standards and validation constraints |
| `component_fact` | Structured component facts from manuals/catalogs |
| `topology_revision` | Learned topology edits and diffs |
| `validation_lesson` | Failed checks and accepted fixes |

The design borrows from OpenViking-style session commits, Mem0-style discrete semantic facts, Zep/Graphiti-style temporal graph memory, and Letta/MemGPT-style tiered context loading, but adapts them to engineering artifacts instead of generic chat memory.

### 2.3 Topology source-of-truth foundation

Implemented:

- `ProjectTopology` backend model.
- Topology snapshot persistence.
- Versioned draft topology saves.
- Topology confirmation endpoint.
- Frontend save/confirm actions in the topology panel.

New API endpoints:

```text
GET  /api/projects/{project_id}/topology
POST /api/projects/{project_id}/topology
POST /api/projects/{project_id}/topology/confirm
```

Key files:

- `backend/app/db/models.py`
- `backend/app/core/schemas.py`
- `backend/app/api/topology.py`
- `backend/app/main.py`
- `backend/tests/test_api_topology.py`
- `frontend/src/services/api.ts`
- `frontend/src/views/components/TopologyPanel.tsx`

## 3. Recommended ProjectTopology Evolution

The current `ProjectTopology` is intentionally minimal:

```text
project_topologies
  id
  project_id
  version
  status
  source
  snapshot
  created_at
  confirmed_at
```

This is the correct first step because the ReactFlow/Yjs structure is still evolving. It preserves the full frontend topology without prematurely over-normalizing.

Recommended next evolution:

```text
project_topologies
  id
  project_id
  version
  status: draft | confirmed | exported
  source: ai | user | imported | memory
  snapshot JSON
  summary JSON
  validation JSON
  diff_from_id
  created_at
  confirmed_at
```

Then add derived semantic indexes:

```text
topology_nodes
  id
  topology_id
  node_key
  node_type
  label
  function_role
  component_category
  selected_bom_item_id
  properties JSON
  position JSON

topology_edges
  id
  topology_id
  source_node_key
  target_node_key
  relation
  protocol
  properties JSON
```

Recommended migration strategy:

1. Keep `snapshot` as the canonical recovery/export artifact.
2. Generate `summary`, `topology_nodes`, and `topology_edges` from the snapshot.
3. Use semantic indexes for BOM/code/validation/memory retrieval.
4. Keep migrations in Alembic. Alembic remains actively maintained and is the right fit for FastAPI + SQLAlchemy + PostgreSQL.

## 4. Docker Deployment Notes

The project still follows the existing full Docker deployment model:

```bash
docker compose up -d --build
docker exec ele-backend-1 alembic upgrade head
```

Important follow-up:

- Add an Alembic migration for `project_topologies` before production deployment.
- The current cloud agent environment did not have `docker`, so full Docker validation could not be executed here.
- The backend tests that require Qdrant need a running Qdrant service at `localhost:6333`.

## 5. Test Optimization Plan

### 5.1 Immediate fixes

1. Add Alembic migration coverage for `project_topologies`.
2. Add a migration smoke test:
   - create a fresh database;
   - run `alembic upgrade head`;
   - assert `project_topologies` exists.
3. Fix or isolate Qdrant-dependent tests:
   - either start Qdrant in test setup;
   - or mock `rag_engine.delete_doc_chunks`;
   - or mark integration tests separately.

### 5.2 Split test types

Recommended test groups:

```text
unit
  Pure Python logic:
  - rule_engine
  - chat validation
  - topology summary extraction
  - memory candidate scoring

api
  FastAPI + SQLite:
  - project CRUD
  - topology save/confirm
  - chat endpoint contract
  - requirement document endpoints

integration
  Requires services:
  - PostgreSQL
  - Qdrant
  - MinIO
  - full knowledge upload/delete

frontend
  TypeScript build
  component behavior tests later

e2e
  Docker Compose:
  - upload document
  - generate topology
  - confirm topology
  - generate BOM/code
  - export package
```

### 5.3 Suggested pytest markers

Add markers:

```ini
[pytest]
markers =
    unit: pure unit tests
    api: FastAPI API tests without external services
    integration: tests requiring Qdrant/Postgres/MinIO
```

Then run:

```bash
python3 -m pytest backend/tests -m "not integration" -q
python3 -m pytest backend/tests -m integration -q
```

### 5.4 CI commands

Recommended fast CI:

```bash
cd backend
python3 -m pytest tests/test_api_topology.py tests/test_chat_orchestrator.py tests/test_api_analysis.py tests/test_rule_engine.py tests/test_schemas.py -q

cd frontend
npm ci
npm run build
```

Recommended full Docker CI:

```bash
docker compose up -d --build postgres qdrant minio backend frontend
docker exec ele-backend-1 alembic upgrade head
docker exec ele-backend-1 python -m pytest tests -q
docker compose down -v
```

### 5.5 Frontend test improvements

The frontend currently relies mainly on `tsc && vite build`. Add:

1. Vitest + React Testing Library.
2. Tests for:
   - conversation title derivation;
   - new conversation clear-vs-preserve behavior;
   - topology save/confirm button API calls;
   - chat routing between full LangGraph and fast `/chat`.
3. A lightweight mock for `ReactFlow` so topology panel behavior can be tested without browser-heavy setup.

### 5.6 Memory flywheel future tests

When memory modules are added, test these behaviors first:

1. Exported project commits a `project_case` memory.
2. User correction creates project-local low-authority memory.
3. Explicit "mark as reusable" promotes memory to global.
4. Retrieval ranks:
   - standard rules above project cases;
   - validated function patterns above LLM-only memories;
   - user preferences unless overridden by current request.

## 6. Recommended Next Implementation Steps

1. Add Alembic migration for `project_topologies`.
2. Add topology summary extraction:
   - node counts;
   - edge relation counts;
   - estimated DI/DO/AI/AO;
   - detected functional units.
3. Add `/bom/from-topology`.
4. Add `/codegen/from-topology`.
5. Seed the first ABCD pattern records:
   - pneumatic cylinder extend/retract;
   - servo relative encoder homing;
   - single conveyor VFD;
   - control cabinet base.
6. Add export package skeleton.
7. Add memory commit for exported project cases.

## 7. Known Environment Gaps

Observed in the cloud agent environment:

- `docker` is not installed.
- `graphify` is not installed.
- Qdrant is not running at `localhost:6333`, so the existing knowledge-delete integration test fails.

Recommended cloud environment setup:

```text
Install backend dependencies, pytest, pytest-asyncio, aiosqlite, frontend npm dependencies, graphify CLI, Docker or service equivalents for Qdrant/PostgreSQL/MinIO, and configure a startup script that can run backend tests plus frontend build without manual package installation.
```
