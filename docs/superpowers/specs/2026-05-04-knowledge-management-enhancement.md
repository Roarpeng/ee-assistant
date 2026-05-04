# Knowledge Management Enhancement Design

**Date:** 2026-05-04
**Status:** Approved

## Overview

Two enhancements to the knowledge base module:
1. **Batch delete** — delete multiple documents at once via selection mode
2. **Vectorization progress** — real-time phased progress indicator during document processing

## Motivation

- Current `KnowledgePanel` renders hardcoded mock data; needs real API integration
- Single delete exists (`DELETE /api/knowledge/docs/{id}`) but no batch operation
- Upload processes chunks synchronously (blocks response), no progress visibility
- Users uploading large PDFs have no indication of processing status

---

## Backend Design

### 1. KnowledgeDoc Model — Add `status` Field

```python
# db/models.py
status: Mapped[str] = mapped_column(String(32), default="uploading")
```

**State machine:**
```
uploading → chunking → embedding → graph_extracting → ready
any_stage → error (on exception)
```

Stage descriptions:
- `uploading` — file received, about to extract text
- `chunking` — text extracted, splitting into chunks
- `embedding` — calling embedding API, upserting to Qdrant
- `graph_extracting` — LLM entity/relation extraction, graph upsert
- `ready` — all processing complete
- `error` — processing failed

### 2. Schemas

```python
# schemas.py

class KnowledgeDocOut(BaseModel):
    id: str
    filename: str
    manufacturer: str
    category_tags: list[str]
    chunk_count: int
    status: str              # NEW
    uploaded_at: datetime
    model_config = {"from_attributes": True}

class BatchDeleteInput(BaseModel):  # NEW
    ids: list[str]
```

### 3. Upload → Async with Phase Push

Current flow blocks on embedding. New flow:

```
POST /api/knowledge/docs
  1. Create KnowledgeDoc in DB (status="uploading")
  2. Return 201 with doc immediately
  3. asyncio.create_task(_process_document(doc.id)):
     a. Extract PDF text           → update status="chunking"
     b. Chunk text                 → update status="embedding"
     c. Embed + upsert to Qdrant   → update status="graph_extracting"
     d. Graph extraction (existing) → update status="ready"
     On exception                   → update status="error"
```

Status updates are persisted to DB so polling also works as fallback.

### 4. WebSocket — Knowledge Document Progress

```
WS /ws/knowledge/docs/{doc_id}
```

- Client connects after receiving upload response
- Server pushes `ProgressEvent(stage=<status>, message=<description>)` on each phase transition
- Closes connection after `ready` or `error`

This mirrors the existing `orchestrator.push()` pattern used by the analysis flow.

### 5. Batch Delete Endpoint

```
DELETE /api/knowledge/docs
Body: {"ids": ["id1", "id2", ...]}
Response: {"deleted": N}
```

- Iterates IDs: deletes Qdrant chunks via `rag_engine.delete_doc_chunks()`, deletes DB row
- Returns count of successfully deleted docs
- If all fail → 500; partial success → 200 with count

---

## Frontend Design

### 1. Zustand Store — New Knowledge State

```typescript
// store.ts additions
knowledgeDocs: KnowledgeDoc[]         // real doc list from API
knowledgeSelectionMode: boolean       // toggled by "选择" button
selectedDocIds: Set<string>           // checked item IDs
loading: boolean                      // initial fetch loading

setKnowledgeDocs(docs): void
toggleSelectionMode(): void
toggleDocSelection(id): void
selectAllDocs(): void
clearSelection(): void
```

### 2. API Service — Batch Delete

```typescript
// api.ts
deleteKnowledgeDocs: (ids: string[]) =>
  request<{ deleted: number }>(`/knowledge/docs`, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  }),
```

### 3. WebSocket Hook

```
useKnowledgeProgress(docId: string) → { status, message }
```

Connects to `ws://.../ws/knowledge/docs/{docId}` on mount, disconnects on unmount or completion.

### 4. KnowledgePanel — Full Rewrite

**Layout:**

```
┌───────────────────────────────────────┐
│ 文档库              [选择] [🔍 搜索]  │  ← header with action buttons
├───────────────────────────────────────┤
│                                       │
│  ┌─ 文档卡片 ───────────────────────┐ │
│  │ ○ [PDF] Siemens S7-1500 手册     │ │  ← normal mode: no checkbox
│  │   就绪 ✓   3 块  ·  2 天前       │ │  ← status badge + metadata
│  │   [PLC] [Siemens]               │ │  ← category tags
│  └──────────────────────────────────┘ │
│                                       │
│  ═══ 选择模式操作栏 ═══════════════  │  ← only visible in selection mode
│  已选 3 项        [全选] [删除所选]   │
│                                       │
│  [+ 上传文档]                         │  ← always visible upload button
└───────────────────────────────────────┘
```

**Selection mode behavior:**
- Clicking "选择" toggles selection mode
- In selection mode: checkboxes appear on cards, action bar slides up from bottom
- Clicking a card toggles its checkbox (not the card body area — the card itself opens detail in future)
- "全选" selects all documents
- "删除所选" calls batch delete API, then refreshes list
- Exiting selection mode clears selection

**Status badge design (per stage):**

| Stage | Label | Color | Animation |
|-------|-------|-------|-----------|
| `uploading` | 上传中 | gray-400 | pulse |
| `chunking` | 分块中 | blue-400 | pulse |
| `embedding` | 嵌入中 | indigo-400 | pulse |
| `graph_extracting` | 图谱提取 | purple-400 | pulse |
| `ready` | 就绪 ✓ | green-400 | none |
| `error` | 失败 ✗ | red-400 | none |

If document is in an active (non-terminal) stage, connect WebSocket for live updates.

### 5. i18n Additions

```typescript
knowledge: {
  title: '文档库',
  search: '搜索规格、文档...',
  upload: '上传文档',
  select: '选择',           // NEW
  exitSelect: '取消选择',    // NEW
  selectAll: '全选',        // NEW
  deleteSelected: '删除所选', // NEW
  selected: (n) => `已选 ${n} 项`, // NEW
  status: {                  // NEW
    uploading: '上传中',
    chunking: '分块中',
    embedding: '嵌入中',
    graph_extracting: '图谱提取',
    ready: '就绪',
    error: '失败',
  },
  docs: [],  // emptied — real data from API
}
```

---

## File Change List

| File | Change |
|------|--------|
| `backend/app/db/models.py` | KnowledgeDoc: add `status` column |
| `backend/app/core/schemas.py` | KnowledgeDocOut: add `status`. Add `BatchDeleteInput` |
| `backend/app/api/knowledge.py` | Upload → async + phase push. Add batch DELETE. Add WS endpoint |
| `frontend/src/models/store.ts` | Add knowledge state: docs, selection mode, selected IDs |
| `frontend/src/services/api.ts` | Add `deleteKnowledgeDocs(ids[])` |
| `frontend/src/services/i18n.ts` | Add selection mode, status labels, remove mock docs |
| `frontend/src/views/components/KnowledgePanel.tsx` | Full rewrite: real data, selection mode, status badges |

### Migration

Alembic migration needed for new `status` column on `knowledge_docs`.

---

## Edge Cases

- **Upload fails mid-processing:** status set to `error`, document remains in list (user can delete and retry)
- **Batch delete with some already-deleted IDs:** skip missing, return count of actually deleted
- **WebSocket disconnect during processing:** status persists in DB, polling on reconnect shows latest
- **Empty batch delete request:** return 400
- **Selection mode + upload:** exiting selection mode on upload start
- **ComponentNode/ComponentEdge with deleted source_doc_id:** FK is nullable — graph nodes/edges persist with `source_doc_id = NULL`. Graph data survives document deletion. Same behavior as existing single delete.
