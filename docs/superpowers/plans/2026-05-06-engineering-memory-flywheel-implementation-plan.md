# Engineering Memory Flywheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Volta toward an engineering-memory-driven design workspace where topology is the project source of truth and exported projects become reusable memories.

**Architecture:** Implement in milestones. First persist confirmed ReactFlow/Yjs topology snapshots in the backend and expose save/confirm APIs. Later milestones add design patterns, requirement document parsing, export packages, and memory commit/retrieval.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic v2, pytest/httpx, React 18, TypeScript, Zustand, ReactFlow/Yjs.

---

## File Structure

- `backend/app/db/models.py` — add `ProjectTopology` ORM model and project relationship.
- `backend/app/core/schemas.py` — add topology input/output schemas.
- `backend/app/api/topology.py` — create topology save/get/confirm endpoints.
- `backend/app/main.py` — register topology router.
- `backend/tests/test_api_topology.py` — verify save, fetch, versioning, and confirm behavior.
- `frontend/src/services/api.ts` — add topology API client calls.
- `frontend/src/views/components/TopologyPanel.tsx` — add save/confirm actions using current Yjs snapshot.

## Milestone 1: Topology Source of Truth

### Task 1: Backend topology persistence

**Files:**
- Modify: `backend/app/db/models.py`
- Modify: `backend/app/core/schemas.py`
- Create: `backend/app/api/topology.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_api_topology.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_save_and_get_project_topology():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        project = (await client.post("/api/projects?name=Topo")).json()
        project_id = project["id"]
        payload = {
            "nodes": [{"id": "plc_1", "type": "plc", "label": "S7-1200", "x": 10, "y": 20}],
            "edges": [],
            "source": "user",
        }

        saved = await client.post(f"/api/projects/{project_id}/topology", json=payload)
        assert saved.status_code == 201
        body = saved.json()
        assert body["project_id"] == project_id
        assert body["version"] == 1
        assert body["status"] == "draft"
        assert body["snapshot"]["nodes"][0]["label"] == "S7-1200"

        fetched = await client.get(f"/api/projects/{project_id}/topology")
        assert fetched.status_code == 200
        assert fetched.json()["id"] == body["id"]


@pytest.mark.asyncio
async def test_topology_versions_increment_and_confirm_latest():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        project = (await client.post("/api/projects?name=Topo")).json()
        project_id = project["id"]

        for label in ("Draft A", "Draft B"):
            response = await client.post(
                f"/api/projects/{project_id}/topology",
                json={"nodes": [{"id": "n1", "type": "plc", "label": label, "x": 0, "y": 0}], "edges": []},
            )
            assert response.status_code == 201

        latest = (await client.get(f"/api/projects/{project_id}/topology")).json()
        assert latest["version"] == 2
        assert latest["snapshot"]["nodes"][0]["label"] == "Draft B"

        confirmed = await client.post(f"/api/projects/{project_id}/topology/confirm")
        assert confirmed.status_code == 200
        assert confirmed.json()["status"] == "confirmed"
```

- [ ] **Step 2: Run tests to verify red**

Run:

```bash
python3 -m pytest backend/tests/test_api_topology.py -q
```

Expected: collection/import or 404 failures because topology APIs/models do not exist yet.

- [ ] **Step 3: Implement minimal backend**

Add `ProjectTopology` with `snapshot`, `version`, `status`, `source`, timestamps. Add `TopologyInput` and `TopologyOut`. Add endpoints:

```text
GET  /api/projects/{project_id}/topology
POST /api/projects/{project_id}/topology
POST /api/projects/{project_id}/topology/confirm
```

- [ ] **Step 4: Run tests to verify green**

Run:

```bash
python3 -m pytest backend/tests/test_api_topology.py -q
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/models.py backend/app/core/schemas.py backend/app/api/topology.py backend/app/main.py backend/tests/test_api_topology.py
git commit -m "feat: persist project topology"
```

### Task 2: Frontend save/confirm topology actions

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/views/components/TopologyPanel.tsx`

- [ ] **Step 1: Add API client methods**

```typescript
saveTopology: (projectId: string, topology: { nodes: any[]; edges: any[] }, source = 'user') =>
  request<any>(`/projects/${projectId}/topology`, {
    method: 'POST',
    body: JSON.stringify({ ...topology, source }),
  }),

confirmTopology: (projectId: string) =>
  request<any>(`/projects/${projectId}/topology/confirm`, { method: 'POST' }),
```

- [ ] **Step 2: Add UI actions to `TopologyPanel.tsx`**

Use `getTopologySnapshot()` and add buttons:

```text
保存草稿
确认拓扑
```

`保存草稿` posts current snapshot. `确认拓扑` first saves the current snapshot, then confirms the latest backend topology.

- [ ] **Step 3: Build frontend**

Run:

```bash
cd frontend && npm run build
```

Expected: TypeScript and Vite build succeed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/views/components/TopologyPanel.tsx
git commit -m "feat: add topology save confirm actions"
```

## Later Milestones

### Milestone 2: Seed ABCD pattern library

- Add `design_patterns` table.
- Seed pneumatic, servo, conveyor, and cabinet base patterns.
- Add pattern matcher service.
- Add functional units table and API.
- Start routing requirement extraction through pattern matching before topology generation.

### Milestone 3: Requirement document ingestion

- Add `requirement_docs` table.
- Add upload endpoint under projects, separate from knowledge docs.
- Support TXT/PDF first, then DOCX, then XLSX/CSV.
- Normalize extracted text/tables into requirement atoms.

### Milestone 4: Export package

- Add `export_packages` table.
- Generate topology JSON, BOM XLSX, IO XLSX, ST/SCL files, markdown report.
- Store package in MinIO.
- Mark project export as memory commit trigger.

### Milestone 5: Memory flywheel

- Add `memory_items`, `memory_links`, and `memory_embeddings`.
- Add `backend/app/core/memory/` modules.
- Commit exported projects as `project_case` memories.
- Retrieve user preferences, patterns, standards, component facts, and similar projects before generation.

## Self-Review

- Spec coverage: This plan covers the first source-of-truth milestone in executable detail and records later milestones at implementation-backlog level.
- Placeholder scan: No placeholder implementation steps remain in Milestone 1.
- Type consistency: Endpoint names, schema names, and frontend API names are consistent across tasks.
