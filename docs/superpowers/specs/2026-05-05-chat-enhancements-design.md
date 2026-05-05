# Chat Enhancements: Title/Tags + Search + Clustering

**Date:** 2026-05-05
**Status:** design-approved

## Overview

Three enhancements to the conversation system:
1. **Auto title & topic tag generation** — LLM generates a 2-6 char title and 2-4 topic tags from the first user message
2. **Conversation search** — Backend ILIKE search across title, name, and topic_tags
3. **Topic clustering** — Embedding-based cosine similarity grouping of conversations by topic

All backend-driven; PG is the authoritative source for title/tags.

## Architecture

```
requirements_agent (natural language → structured req)
    │
    ├── category_mapper ──────────┐
    ├── safety_assessor ──────────┤
    ├── constraint_extractor ─────┤
    └── title_generator (NEW) ────┘  ← fan-out, zero added latency

        ... (existing graph continues) ...

        END → SSE done payload includes title + topic_tags
```

Title generation runs as a parallel fan-out node alongside the 3 existing nodes — total graph latency unchanged.

## Data Model

### projects table — 2 new columns

```python
title: Mapped[str | None] = mapped_column(String(200), nullable=True)
topic_tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)
```

### AnalysisState — 2 new keys

```python
title: str | None
topic_tags: list[str] | None
```

### ProjectOut — 2 new fields

```python
title: str | None = None
topic_tags: list[str] | None = None
```

Data authority: PG → frontend localStorage as display cache only.

## Backend Changes

### 1. title_generator node (agents.py)

- Receives `state["user_input"]`
- Calls `llm_service.generate_title_and_tags(user_input)` — lightweight LLM prompt
- Returns `{"title": "...", "topic_tags": ["...", "..."]}` 
- Returns `{"title": None, "topic_tags": None}` on LLM failure (non-blocking)

### 2. Graph registration (builder.py)

```python
workflow.add_node("title_generator", title_generator)
workflow.add_edge("requirements_agent", "title_generator")
workflow.add_edge("title_generator", "selection_supervisor")
```

### 3. DB persistence (analysis.py)

In `analyze_project_v2` and `resume_project_analysis`, extend the final `update(Project)` call:

```python
await db.execute(
    update(Project).where(Project.id == project_id).values(
        status="ready",
        title=final_state.get("title"),
        topic_tags=final_state.get("topic_tags"),
    )
)
```

### 4. Search endpoint (projects.py)

```
GET /api/projects/search?q=<query>
```

- ILIKE on `title`, `name`, and `array_to_string(topic_tags, ',')`
- Ordered by `updated_at` desc, limit 20
- Returns `list[ProjectOut]`

### 5. Cluster endpoint (projects.py)

```
POST /api/projects/cluster
Body: { embedding_config: { api_key, base_url, model, dimension } }
```

- Fetches all projects with non-null `title`
- Embeds each title via the configured embedding API
- Computes pairwise cosine similarity (threshold 0.75)
- Returns groups with auto-generated labels (most frequent topic_tag in cluster)

Response shape:
```json
{
  "clusters": [
    {
      "label": "电机控制",
      "project_ids": ["id1", "id2"],
      "projects": [...]
    }
  ],
  "unclustered": [...]
}
```

## Frontend Changes

| File | Change |
|------|--------|
| `ConversationSidebar.tsx` | Search input (300ms debounce) + cluster grouped view + time/topic view toggle |
| `ChatPanel.tsx` | Parse `title` + `topic_tags` from SSE `done` event, update sidebar cache |
| `store.ts` | `searchConversations()`, `clusterConversations()` actions, `conversationViewMode` state |
| `api.ts` | `searchProjects(q)`, `clusterProjects(config)` |
| `i18n.ts` | Search placeholder, cluster labels, view toggle text |

## llm_service Changes

New method:
```python
async def generate_title_and_tags(self, user_input: str) -> dict:
    """Generate a concise title and topic tags from user's natural language input."""
```

Prompt: "Generate a 2-6 character title and 2-4 topic tags for an industrial automation project. Return JSON: {title, topic_tags}."

## Implementation Steps

| Step | What | Files |
|------|------|-------|
| 1 | Add title/topic_tags columns + alembic migration | `models.py`, migration |
| 2 | Update AnalysisState + ProjectOut schemas | `state.py`, `schemas.py` |
| 3 | Add generate_title_and_tags to llm_service | `llm_service.py` |
| 4 | Add title_generator node + register in graph | `agents.py`, `builder.py` |
| 5 | DB persistence in analysis.py final state handler | `analysis.py` |
| 6 | Search endpoint | `projects.py` |
| 7 | Cluster endpoint | `projects.py` |
| 8 | Frontend: API methods | `api.ts` |
| 9 | Frontend: store actions | `store.ts` |
| 10 | Frontend: ConversationSidebar search + cluster UI | `ConversationSidebar.tsx` |
| 11 | Frontend: ChatPanel SSE title/tags parsing | `ChatPanel.tsx` |
| 12 | Frontend: i18n strings | `i18n.ts` |

## Error Handling

- Title generation failure → graceful degradation, title stays null, no user-visible error
- Search returns empty → normal, shows "no results" in UI
- Cluster embedding API fails → return everything as unclustered with a warning
- Clustering with 0 or 1 projects → skip computation, return empty clusters
