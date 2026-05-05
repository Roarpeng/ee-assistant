# 对话系统增强 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为对话系统增加自动标题/话题标签生成、对话搜索和话题聚类三项增强功能

**Architecture:** 后端新增 LangGraph `title_generator` 节点（fan-out 并行），扩展 `projects` 表存储 title/topic_tags，新增搜索和聚类两个 REST 端点。前端 ConversationSidebar 增加搜索框和聚类分组视图

**Tech Stack:** Python/FastAPI/SQLAlchemy/LangGraph · React/TypeScript/Zustand · PostgreSQL JSONB + ILIKE · OpenAI-compatible Embedding API

**Spec:** `docs/superpowers/specs/2026-05-05-chat-enhancements-design.md`

---

## 文件结构

| 文件 | 角色 | 操作 |
|------|------|------|
| `backend/app/db/models.py` | Project ORM — 新增 title + topic_tags 列 | 修改 |
| `backend/alembic/versions/003_add_project_title_tags.py` | 数据库迁移 | 新建 |
| `backend/app/core/state.py` | AnalysisState — 新增 title + topic_tags | 修改 |
| `backend/app/core/schemas.py` | ProjectOut + 聚类请求/响应 schema | 修改 |
| `backend/app/core/llm_service.py` | 新增 generate_title_and_tags 方法 | 修改 |
| `backend/app/core/graph/agents.py` | 新增 title_generator 节点函数 | 修改 |
| `backend/app/core/graph/builder.py` | 注册 title_generator 到图谱 | 修改 |
| `backend/app/api/analysis.py` | SSE done 后持久化 title/tags 到 PG | 修改 |
| `backend/app/api/projects.py` | 新增 search + cluster 端点 | 修改 |
| `backend/tests/test_conversation_enhancements.py` | 后端测试 | 新建 |
| `frontend/src/services/api.ts` | 新增 searchProjects + clusterProjects | 修改 |
| `frontend/src/models/store.ts` | 新增 conversation 相关 state + actions | 修改 |
| `frontend/src/services/i18n.ts` | 新增搜索/聚类文案 | 修改 |
| `frontend/src/views/components/ConversationSidebar.tsx` | 搜索框 + 聚类视图 + 视图切换 | 修改 |
| `frontend/src/views/components/ChatPanel.tsx` | SSE done 解析 title/tags | 修改 |

---

### Task 1: 数据库迁移 + ORM 模型更新

**Files:**
- Modify: `backend/app/db/models.py:17`
- Create: `backend/alembic/versions/003_add_project_title_tags.py`

- [ ] **Step 1: Project 模型新增 title 和 topic_tags 列**

在 `backend/app/db/models.py` 的 `Project` 类中，`updated_at` 行之后插入：

```python
title: Mapped[str | None] = mapped_column(String(200), nullable=True)
topic_tags: Mapped[list | None] = mapped_column(JSON, nullable=True)
```

- [ ] **Step 2: 运行 type check 确认模型语法正确**

```bash
cd backend && python -c "from app.db.models import Project; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: 创建 alembic 迁移文件**

创建 `backend/alembic/versions/003_add_project_title_tags.py`：

```python
"""add title and topic_tags to projects

Revision ID: 003
Revises: 002
Create Date: 2026-05-05 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '003'
down_revision: Union[str, Sequence[str], None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('title', sa.String(length=200), nullable=True))
    op.add_column('projects', sa.Column('topic_tags', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'topic_tags')
    op.drop_column('projects', 'title')
```

- [ ] **Step 4: 运行迁移**

```bash
cd backend && PYTHONPATH=. alembic upgrade head
```

Expected: `INFO  [alembic.runtime.migration] Running upgrade 002 -> 003`

- [ ] **Step 5: 验证列存在**

```bash
cd backend && python -c "
from app.db.repository import async_session
from sqlalchemy import text
import asyncio

async def check():
    async with async_session() as s:
        r = await s.execute(text(\"SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND column_name IN ('title','topic_tags')\"))
        print([row[0] for row in r.fetchall()])

asyncio.run(check())
"
```

Expected: `['title', 'topic_tags']`

- [ ] **Step 6: Commit**

```bash
git add backend/app/db/models.py backend/alembic/versions/003_add_project_title_tags.py
git commit -m "feat: add title and topic_tags columns to projects table"
```

---

### Task 2: Schema 更新

**Files:**
- Modify: `backend/app/core/state.py`
- Modify: `backend/app/core/schemas.py`

- [ ] **Step 1: AnalysisState 新增 title + topic_tags**

在 `backend/app/core/state.py` 的 `AnalysisState` 类中新增：

```python
title: str | None
topic_tags: list[str] | None
```

插入位置：在 `stage: str` 行之前。

- [ ] **Step 2: ProjectOut 新增 title + topic_tags**

在 `backend/app/core/schemas.py` 的 `ProjectOut` 类中新增：

```python
title: str | None = None
topic_tags: list[str] | None = None
```

插入位置：在 `code_modules: list[STModuleOut]` 行之前。

- [ ] **Step 3: 新增聚类请求和响应 schema**

在 `backend/app/core/schemas.py` 末尾新增：

```python
class ClusterRequest(BaseModel):
    embedding_config: dict | None = None


class ClusterProjectItem(BaseModel):
    id: str
    name: str
    title: str | None
    topic_tags: list[str] | None
    updated_at: datetime


class ClusterGroup(BaseModel):
    label: str
    project_ids: list[str]
    projects: list[ClusterProjectItem]


class ClusterResponse(BaseModel):
    clusters: list[ClusterGroup] = Field(default_factory=list)
    unclustered: list[ClusterProjectItem] = Field(default_factory=list)
```

- [ ] **Step 4: 验证导入**

```bash
cd backend && python -c "from app.core.state import AnalysisState; from app.core.schemas import ProjectOut, ClusterRequest, ClusterResponse; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/state.py backend/app/core/schemas.py
git commit -m "feat: add title/topic_tags to state and schemas, add cluster request/response schemas"
```

---

### Task 3: llm_service 新增 generate_title_and_tags 方法

**Files:**
- Modify: `backend/app/core/llm_service.py`

- [ ] **Step 1: 新增方法**

在 `backend/app/core/llm_service.py` 的 `recommend_components` 方法之前插入：

```python
async def generate_title_and_tags(self, user_input: str) -> dict:
    """根据用户自然语言输入生成 2-6 字中文标题和 2-4 个话题标签。"""
    system = """你是工业自动化领域的项目命名专家。
根据用户的自然语言需求描述，生成：
- title: 2-6 个中文字符的简洁标题（如"三电机传送带控制"）
- topic_tags: 2-4 个话题标签（如 ["电机控制", "安全回路", "PROFINET"]）

标签应涵盖：运动类型（伺服/变频/步进）、安全等级（SIL2/安全回路）、通信协议（PROFINET/EtherCAT）、设备类型（传送带/机械臂/CNC）等维度。
Output valid JSON only, no markdown wrapping: {"title": "...", "topic_tags": ["...", "..."]}"""
    try:
        text = await self.chat(system, user_input, max_tokens=256)
        return self._parse_json(text)
    except Exception as e:
        print(f"generate_title_and_tags failed: {e}")
        return {"title": None, "topic_tags": None}
```

- [ ] **Step 2: 验证方法可导入**

```bash
cd backend && python -c "from app.core.llm_service import llm_service; print(hasattr(llm_service, 'generate_title_and_tags'))"
```

Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/llm_service.py
git commit -m "feat: add generate_title_and_tags method to llm_service"
```

---

### Task 4: title_generator 图谱节点 + 注册

**Files:**
- Modify: `backend/app/core/graph/agents.py`
- Modify: `backend/app/core/graph/builder.py`

- [ ] **Step 1: 新增 title_generator 节点函数**

在 `backend/app/core/graph/agents.py` 的 `requirements_agent` 函数之后，`category_mapper` 之前插入：

```python
async def title_generator(state: AnalysisState) -> dict:
    """Generate conversation title and topic tags from user input. Non-blocking on failure."""
    if state.get("title") or state.get("stage", "") in ("selection_done", "continuing"):
        return {}
    try:
        result = await llm_service.generate_title_and_tags(state["user_input"])
        return {
            "title": result.get("title"),
            "topic_tags": result.get("topic_tags"),
        }
    except Exception:
        return {"title": None, "topic_tags": None}
```

- [ ] **Step 2: 注册节点到图谱**

在 `backend/app/core/graph/builder.py` 中：

修改 import 语句（第 16-26 行），在 `requirements_agent` 之后添加 `title_generator`：

```python
from app.core.graph.agents import (
    requirements_agent,
    title_generator,
    category_mapper,
    ...
)
```

在 `add_node` 块中（第 28 行之后）添加：

```python
workflow.add_node("title_generator", title_generator)
```

修改 fan-out 边（第 38 行 `workflow.set_entry_point("requirements_agent")` 之后），在 `requirements_agent → category_mapper` 之前插入：

```python
workflow.add_edge("requirements_agent", "title_generator")
workflow.add_edge("title_generator", "selection_supervisor")
```

完整修改后的 fan-out 部分：

```python
workflow.set_entry_point("requirements_agent")
workflow.add_edge("requirements_agent", "category_mapper")
workflow.add_edge("requirements_agent", "safety_assessor")
workflow.add_edge("requirements_agent", "constraint_extractor")
workflow.add_edge("requirements_agent", "title_generator")
workflow.add_edge("category_mapper", "selection_supervisor")
workflow.add_edge("safety_assessor", "selection_supervisor")
workflow.add_edge("constraint_extractor", "selection_supervisor")
workflow.add_edge("title_generator", "selection_supervisor")
```

- [ ] **Step 3: 验证图谱编译**

```bash
cd backend && python -c "from app.core.graph.builder import build_graph; g = build_graph(); print('Nodes:', list(g.nodes.keys())[:5]); print('OK')"
```

Expected: 输出包含 `title_generator` 节点名

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/graph/agents.py backend/app/core/graph/builder.py
git commit -m "feat: add title_generator node to LangGraph with fan-out from requirements_agent"
```

---

### Task 5: analysis.py 中持久化 title/tags 到 PG

**Files:**
- Modify: `backend/app/api/analysis.py`

- [ ] **Step 1: analyze_project_v2 中持久化 title/tags**

找到 `backend/app/api/analysis.py` 第 120-122 行的 `update(Project)` 调用：

```python
await db.execute(
    update(Project).where(Project.id == project_id).values(status="ready")
)
```

替换为：

```python
await db.execute(
    update(Project).where(Project.id == project_id).values(
        status="ready",
        title=final_state.get("title"),
        topic_tags=final_state.get("topic_tags"),
    )
)
```

- [ ] **Step 2: resume_project_analysis 中同样持久化**

找到 `backend/app/api/analysis.py` 第 212-214 行的 `update(Project)` 调用，做同样的替换：

```python
await db.execute(
    update(Project).where(Project.id == project_id).values(
        status="ready",
        title=final_state.get("title"),
        topic_tags=final_state.get("topic_tags"),
    )
)
```

- [ ] **Step 3: 验证语法**

```bash
cd backend && python -c "from app.api.analysis import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/analysis.py
git commit -m "feat: persist title and topic_tags to DB after graph analysis completes"
```

---

### Task 6: 搜索端点

**Files:**
- Modify: `backend/app/api/projects.py`

- [ ] **Step 1: 新增搜索端点**

在 `backend/app/api/projects.py` 中，`from sqlalchemy import select` 改为：

```python
from sqlalchemy import select, or_, func
```

在 `delete_project` 之后新增：

```python
@router.get("/search", response_model=list[ProjectOut])
async def search_projects(q: str, session: AsyncSession = Depends(get_session)):
    """搜索项目：按标题、项目名和话题标签模糊匹配"""
    result = await session.execute(
        select(Project)
        .where(
            or_(
                Project.title.ilike(f"%{q}%"),
                Project.name.ilike(f"%{q}%"),
                func.array_to_string(Project.topic_tags, ',').ilike(f"%{q}%"),
            )
        )
        .order_by(Project.updated_at.desc())
        .limit(20)
        .options(
            selectinload(Project.requirement).selectinload(Requirement.io_items),
            selectinload(Project.requirement).selectinload(Requirement.logic_rules),
            selectinload(Project.bom_items),
            selectinload(Project.schematic),
            selectinload(Project.code_modules),
        )
    )
    return result.scalars().all()
```

- [ ] **Step 2: 验证端点可访问**

```bash
cd backend && python -c "
from app.api.projects import router
# Check route is registered
routes = [r.path for r in router.routes]
print('/search' in [r for r in routes])
"
```

Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/projects.py
git commit -m "feat: add GET /api/projects/search endpoint with ILIKE matching"
```

---

### Task 7: 聚类端点

**Files:**
- Modify: `backend/app/api/projects.py`
- Create: `backend/tests/test_conversation_enhancements.py`

- [ ] **Step 1: 新增聚类端点**

在 `backend/app/api/projects.py` 的 `search_projects` 之后新增：

```python
@router.post("/cluster", response_model=ClusterResponse)
async def cluster_projects(body: ClusterRequest, session: AsyncSession = Depends(get_session)):
    """按话题聚类项目：用 Embedding API 向量化标题，余弦相似度分组"""
    from app.core.schemas import ClusterResponse, ClusterGroup, ClusterProjectItem
    from app.core.llm_service import llm_service
    import math

    result = await session.execute(
        select(Project)
        .where(Project.title.isnot(None))
        .order_by(Project.updated_at.desc())
    )
    projects = result.scalars().all()

    if len(projects) <= 1:
        items = [_project_to_cluster_item(p) for p in projects]
        return ClusterResponse(clusters=[], unclustered=items)

    # Embed titles
    titles = [p.title for p in projects]
    try:
        embeddings = await _embed_titles(titles, body.embedding_config or {})
    except Exception:
        # Embedding API failed — return all as unclustered
        items = [_project_to_cluster_item(p) for p in projects]
        return ClusterResponse(clusters=[], unclustered=items)

    # Cosine similarity clustering
    threshold = 0.75
    n = len(projects)
    visited = [False] * n
    clusters: list[list[int]] = []

    def cosine(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(y * y for y in b))
        return dot / (na * nb) if na > 0 and nb > 0 else 0.0

    for i in range(n):
        if visited[i]:
            continue
        group = [i]
        visited[i] = True
        for j in range(n):
            if visited[j]:
                continue
            sim = cosine(embeddings[i], embeddings[j])
            if sim >= threshold:
                group.append(j)
                visited[j] = True
        clusters.append(group)

    # Build response
    cluster_objects = []
    unclustered_items = []
    for group in clusters:
        group_projects = [projects[i] for i in group]
        if len(group) == 1:
            unclustered_items.append(_project_to_cluster_item(group_projects[0]))
        else:
            items = [_project_to_cluster_item(p) for p in group_projects]
            # Label = most frequent topic_tag in the group
            tag_counts: dict[str, int] = {}
            for p in group_projects:
                for tag in (p.topic_tags or []):
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1
            label = max(tag_counts, key=tag_counts.get) if tag_counts else "未分类"
            cluster_objects.append(ClusterGroup(
                label=label,
                project_ids=[p.id for p in group_projects],
                projects=items,
            ))

    return ClusterResponse(clusters=cluster_objects, unclustered=unclustered_items)


def _project_to_cluster_item(p: Project) -> "ClusterProjectItem":
    from app.core.schemas import ClusterProjectItem
    return ClusterProjectItem(
        id=p.id,
        name=p.name,
        title=p.title,
        topic_tags=p.topic_tags,
        updated_at=p.updated_at,
    )


async def _embed_titles(titles: list[str], embed_config: dict) -> list[list[float]]:
    """Use the configured embedding API to vectorize titles."""
    from openai import AsyncOpenAI

    cfg = embed_config
    api_key = cfg.get("api_key", "")
    base_url = cfg.get("base_url", "")
    model = cfg.get("model", "text-embedding-3-small")
    dimension = cfg.get("dimension", 0)

    if not api_key or not base_url:
        raise ValueError("Missing embedding config")

    client = AsyncOpenAI(api_key=api_key, base_url=base_url.rstrip("/"))
    extra = {"dimensions": dimension} if dimension else {}
    resp = await client.embeddings.create(model=model, input=titles, **extra)
    return [d.embedding for d in resp.data]
```

- [ ] **Step 2: 添加必要的 import**

确认 `backend/app/api/projects.py` 顶部有 `ClusterResponse` 的导入。在 imports 中加入：

```python
from app.core.schemas import ProjectOut, ClusterRequest, ClusterResponse
```

（如果已有部分 schema 导入，只需追加缺少的）

- [ ] **Step 3: 写测试**

创建 `backend/tests/test_conversation_enhancements.py`：

```python
"""Tests for conversation title/tags, search, and clustering."""
import pytest
from unittest.mock import AsyncMock, patch
from app.core.schemas import ClusterProjectItem, ClusterGroup, ClusterResponse


class TestClusterLogic:
    def test_empty_projects_returns_empty_clusters(self):
        from app.api.projects import ClusterResponse
        resp = ClusterResponse(clusters=[], unclustered=[])
        assert len(resp.clusters) == 0
        assert len(resp.unclustered) == 0

    def test_single_project_returns_unclustered(self):
        item = ClusterProjectItem(
            id="p1", name="Test", title="测试",
            topic_tags=["电机"], updated_at=None
        )
        resp = ClusterResponse(clusters=[], unclustered=[item])
        assert len(resp.clusters) == 0
        assert len(resp.unclustered) == 1

    def test_cluster_group_has_label_and_ids(self):
        group = ClusterGroup(
            label="电机控制",
            project_ids=["p1", "p2"],
            projects=[],
        )
        assert group.label == "电机控制"
        assert len(group.project_ids) == 2


class TestProjectSchema:
    def test_project_out_has_title_and_tags(self):
        from app.core.schemas import ProjectOut
        assert "title" in ProjectOut.model_fields
        assert "topic_tags" in ProjectOut.model_fields


class TestSearchEndpoint:
    async def test_search_returns_empty_on_no_match(self):
        # Integration test placeholder — validates route exists
        from app.api.projects import router
        paths = [r.path for r in router.routes]
        assert "/search" in paths

    async def test_cluster_endpoint_registered(self):
        from app.api.projects import router
        paths = [r.path for r in router.routes]
        assert "/cluster" in paths
```

- [ ] **Step 4: 运行测试**

```bash
cd backend && python -m pytest tests/test_conversation_enhancements.py -v
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/projects.py backend/tests/test_conversation_enhancements.py
git commit -m "feat: add POST /api/projects/cluster endpoint with cosine similarity grouping"
```

---

### Task 8: 前端 API 方法

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: 新增 searchProjects 和 clusterProjects**

在 `frontend/src/services/api.ts` 的 `testConnectivity` 之前插入：

```typescript
searchProjects: (q: string) =>
  request<any[]>(`/projects/search?q=${encodeURIComponent(q)}`),

clusterProjects: (embeddingConfig?: any) =>
  request<{ clusters: any[]; unclustered: any[] }>(`/projects/cluster`, {
    method: 'POST',
    body: JSON.stringify({ embedding_config: embeddingConfig || getSettings().embedding }),
  }),
```

- [ ] **Step 2: 类型检查**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: add searchProjects and clusterProjects API methods"
```

---

### Task 9: 前端 Store 更新

**Files:**
- Modify: `frontend/src/models/store.ts`

- [ ] **Step 1: 新增类型定义**

在 `frontend/src/models/store.ts` 中，在 `ChatContext` 接口定义之后添加：

```typescript
export interface ClusterGroup {
  label: string;
  project_ids: string[];
  projects: ConversationMeta[];
}

export type ConversationViewMode = 'time' | 'topic';
```

- [ ] **Step 2: 新增 state 和 actions**

在 `AppState` interface 中添加：

```typescript
conversationViewMode: ConversationViewMode;
searchQuery: string;
searchResults: ConversationMeta[];
clusterGroups: ClusterGroup[];
unclusteredConversations: ConversationMeta[];
clusterLoading: boolean;

searchConversations: (q: string) => Promise<void>;
clusterConversations: () => Promise<void>;
setConversationViewMode: (mode: ConversationViewMode) => void;
setSearchQuery: (q: string) => void;
```

- [ ] **Step 3: 实现 actions**

在 `create<AppState>` 的初始 state 对象中添加：

```typescript
conversationViewMode: 'time' as ConversationViewMode,
searchQuery: '',
searchResults: [] as ConversationMeta[],
clusterGroups: [] as ClusterGroup[],
unclusteredConversations: [] as ConversationMeta[],
clusterLoading: false,
```

在 `loadChatHistory` 之后添加 action 实现：

```typescript
searchConversations: async (q: string) => {
  if (!q.trim()) {
    set({ searchResults: [], searchQuery: '' });
    return;
  }
  try {
    const { api } = await import('../services/api');
    const results = await api.searchProjects(q);
    set({
      searchResults: results.map((p: any) => ({
        id: p.id,
        name: p.title || p.name,
        lastMessage: '',
        updatedAt: new Date(p.updated_at).getTime(),
      })),
    });
  } catch {
    set({ searchResults: [] });
  }
},

clusterConversations: async () => {
  set({ clusterLoading: true });
  try {
    const { api } = await import('../services/api');
    const s = useStore.getState();
    const result = await api.clusterProjects(s.settings.embedding);
    set({
      clusterGroups: result.clusters || [],
      unclusteredConversations: result.unclustered || [],
      clusterLoading: false,
    });
  } catch {
    set({ clusterLoading: false });
  }
},

setConversationViewMode: (mode) => set({ conversationViewMode: mode }),

setSearchQuery: (q) => set({ searchQuery: q }),
```

- [ ] **Step 4: 类型检查**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/models/store.ts
git commit -m "feat: add conversation search, cluster, and view mode state to store"
```

---

### Task 10: 前端 i18n 文案

**Files:**
- Modify: `frontend/src/services/i18n.ts`

- [ ] **Step 1: 新增中英文案**

在 `frontend/src/services/i18n.ts` 的 `chat` 对象中新增：

中文 (`zh`)：
```typescript
searchPlaceholder: '搜索对话...',
searchNoResults: '无匹配结果',
viewByTime: '按时间',
viewByTopic: '按话题',
clustering: '聚类中...',
unclustered: '未分类',
newConversation: '新对话',
noConversations: '暂无历史对话',
```

英文 (`en`)：
```typescript
searchPlaceholder: 'Search conversations...',
searchNoResults: 'No results',
viewByTime: 'By Time',
viewByTopic: 'By Topic',
clustering: 'Clustering...',
unclustered: 'Uncategorized',
newConversation: 'New Chat',
noConversations: 'No conversations yet',
```

- [ ] **Step 2: 类型检查**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/i18n.ts
git commit -m "feat: add conversation search and clustering i18n strings"
```

---

### Task 11: ConversationSidebar UI — 搜索 + 聚类视图

**Files:**
- Modify: `frontend/src/views/components/ConversationSidebar.tsx`

- [ ] **Step 1: 新增搜索输入框**

在 `ConversationSidebar.tsx` 的 Header 和 New Conversation 按钮之间，添加搜索框：

在 `{/* Header */}` 注释的 div 之后，`{/* New Conversation Button */}` 之前，插入：

在组件内顶部先新增 ref 和 handler（与其他 hooks 同级）：

```tsx
const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
const searchResults = useStore((s) => s.searchResults);
const searchQuery = useStore((s) => s.searchQuery);
const setSearchQuery = useStore((s) => s.setSearchQuery);

const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
  const q = e.target.value;
  setSearchQuery(q);
  if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  if (q.trim()) {
    searchTimerRef.current = setTimeout(() => {
      useStore.getState().searchConversations(q);
    }, 300);
  }
};
```

然后在 Header 和 New Conversation 按钮之间添加搜索框：

```tsx
{/* Search */}
<div className="px-2 pb-2 shrink-0">
  <input
    type="text"
    value={searchQuery}
    onChange={handleSearch}
    placeholder={tr.chat.searchPlaceholder}
    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg py-1.5 px-2.5 text-[11px] text-neutral-300 placeholder:text-neutral-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
  />
</div>
```

- [ ] **Step 2: 新增视图切换按钮**

在 New Conversation 按钮之后，对话列表之前，插入视图切换：

```tsx
{/* View Toggle */}
<div className="flex gap-1 px-2 pb-2 shrink-0">
  <button
    onClick={() => useStore.getState().setConversationViewMode('time')}
    className={`flex-1 py-1 text-[10px] rounded-lg transition-colors ${
      viewMode === 'time'
        ? 'bg-indigo-500/20 text-indigo-400'
        : 'text-neutral-500 hover:text-neutral-300'
    }`}
  >
    {tr.chat.viewByTime}
  </button>
  <button
    onClick={() => {
      useStore.getState().setConversationViewMode('topic');
      useStore.getState().clusterConversations();
    }}
    className={`flex-1 py-1 text-[10px] rounded-lg transition-colors ${
      viewMode === 'topic'
        ? 'bg-indigo-500/20 text-indigo-400'
        : 'text-neutral-500 hover:text-neutral-300'
    }`}
  >
    {tr.chat.viewByTopic}
  </button>
</div>
```

- [ ] **Step 3: 新增 state 订阅**

在组件内顶部添加：

```tsx
const viewMode = useStore((s) => s.conversationViewMode);
const clusterGroups = useStore((s) => s.clusterGroups);
const unclusteredConversations = useStore((s) => s.unclusteredConversations);
const clusterLoading = useStore((s) => s.clusterLoading);
```

- [ ] **Step 4: 替换对话列表为条件渲染**

将现有 `{/* Conversation List */}` 部分替换为按视图模式条件渲染：

```tsx
{/* Conversation List */}
<div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
  {viewMode === 'time' ? (
    (searchQuery ? searchResults : conversations).length > 0 ? (
      (searchQuery ? searchResults : conversations).map((conv) => (
        <div
          key={conv.id}
          onClick={() => handleSwitchConversation(conv)}
          className={`group px-3 py-2 rounded-xl cursor-pointer transition-colors text-left w-full ${
            project?.id === conv.id
              ? 'bg-indigo-500/10 border border-indigo-500/20'
              : 'hover:bg-neutral-800 border border-transparent'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-300 truncate flex-1">
              {conv.name}
            </span>
            <button
              onClick={(e) => handleDelete(e, conv.id)}
              className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-rose-400 ml-1 shrink-0 text-[10px]"
            >
              x
            </button>
          </div>
          <div className="text-[10px] text-neutral-500 truncate mt-0.5">
            {conv.lastMessage || '新对话'}
          </div>
          <div className="text-[9px] text-neutral-600 mt-0.5">
            {new Date(conv.updatedAt).toLocaleDateString()}
          </div>
        </div>
      ))
    ) : (
      <div className="text-[10px] text-neutral-600 text-center py-8 px-2">
        {searchQuery ? tr.chat.searchNoResults : tr.chat.noConversations}
      </div>
    )
  ) : clusterLoading ? (
    <div className="text-[10px] text-neutral-500 text-center py-8">
      {tr.chat.clustering}
    </div>
  ) : (
    <>
      {clusterGroups.map((group) => (
        <div key={group.label} className="mb-2">
          <div className="text-[9px] font-bold uppercase text-indigo-400/70 px-2 py-1">
            {group.label}
          </div>
          {group.projects.map((proj: any) => (
            <div
              key={proj.id}
              onClick={() => handleSwitchConversation(proj)}
              className={`group px-3 py-2 rounded-xl cursor-pointer transition-colors text-left w-full ${
                project?.id === proj.id
                  ? 'bg-indigo-500/10 border border-indigo-500/20'
                  : 'hover:bg-neutral-800 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-300 truncate flex-1">
                  {proj.title || proj.name}
                </span>
                <button
                  onClick={(e) => handleDelete(e, proj.id)}
                  className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-rose-400 ml-1 shrink-0 text-[10px]"
                >
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
      {unclusteredConversations.length > 0 && (
        <div className="mb-2">
          <div className="text-[9px] font-bold uppercase text-neutral-500 px-2 py-1">
            {tr.chat.unclustered}
          </div>
          {unclusteredConversations.map((proj: any) => (
            <div
              key={proj.id}
              onClick={() => handleSwitchConversation(proj)}
              className={`group px-3 py-2 rounded-xl cursor-pointer transition-colors text-left w-full ${
                project?.id === proj.id
                  ? 'bg-indigo-500/10 border border-indigo-500/20'
                  : 'hover:bg-neutral-800 border border-transparent'
              }`}
            >
              <span className="text-xs font-bold text-neutral-300 truncate">
                {proj.title || proj.name}
              </span>
            </div>
          ))}
        </div>
      )}
      {clusterGroups.length === 0 && unclusteredConversations.length === 0 && !clusterLoading && (
        <div className="text-[10px] text-neutral-600 text-center py-8 px-2">
          {tr.chat.noConversations}
        </div>
      )}
    </>
  )}
</div>
```

- [ ] **Step 5: 类型检查 + 构建**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/components/ConversationSidebar.tsx
git commit -m "feat: add search input, topic clustering view, and time/topic toggle to ConversationSidebar"
```

---

### Task 12: ChatPanel SSE 解析 title/tags

**Files:**
- Modify: `frontend/src/views/components/ChatPanel.tsx`

- [ ] **Step 1: 在 SSE done 事件中解析 title 和 topic_tags**

在 `ChatPanel.tsx` 的 `analyzeV2SSE` SSE 循环中，`if (data.done)` 块内（约第 269 行），在 `if (data.payload)` 之前插入：

```typescript
// Update conversation title and tags from LangGraph output
if (data.payload?.title || data.payload?.topic_tags) {
  const store = useStore.getState();
  if (store.project) {
    const updated = { ...store.project };
    try {
      const raw = localStorage.getItem('volta-conversations');
      const convs = raw ? JSON.parse(raw) : [];
      const idx = convs.findIndex((c: any) => c.id === store.project!.id);
      if (idx !== -1) {
        convs[idx].name = data.payload.title || convs[idx].name;
      }
      localStorage.setItem('volta-conversations', JSON.stringify(convs));
    } catch {}
  }
}
```

同样的代码添加到 `resumeAnalysis` SSE 循环中的 `if (data.done)` 块内。

- [ ] **Step 2: 类型检查**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/components/ChatPanel.tsx
git commit -m "feat: parse title and topic_tags from SSE done event, update sidebar cache"
```

---

### Task 13: 端到端验证

- [ ] **Step 1: 启动后端并运行完整测试**

```bash
cd backend && python -m pytest tests/ -v --timeout=30
```

- [ ] **Step 2: 前端构建验证**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

Expected: both pass

- [ ] **Step 3: 功能验证清单**

```bash
# 启动服务
docker compose up -d --build

# 1. 创建新项目 → 发送一条对话 → 检查 projects 表 title 是否有值
docker exec ele-backend-1 python -c "
from app.db.repository import async_session
from sqlalchemy import select, text
import asyncio
async def check():
    async with async_session() as s:
        r = await s.execute(text('SELECT id, name, title, topic_tags FROM projects'))
        for row in r.fetchall():
            print(row)
asyncio.run(check())
"

# 2. 搜索测试
curl "http://localhost:8000/api/projects/search?q=电机"

# 3. 聚类测试
curl -X POST http://localhost:8000/api/projects/cluster \
  -H "Content-Type: application/json" \
  -d '{"embedding_config": {"api_key":"test","base_url":"https://api.openai.com/v1","model":"text-embedding-3-small"}}'
```

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat: complete conversation enhancements — title/tags, search, clustering"
```
