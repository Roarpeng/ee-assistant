# 对话系统增强：自动标题/话题标签 + 搜索 + 聚类

**日期：** 2026-05-05
**状态：** 设计已确认

## 概述

对话系统的三项增强：
1. **自动标题与话题标签生成** — LLM 根据首条用户消息自动生成 2-6 字标题和 2-4 个话题标签
2. **对话搜索** — 后端 ILIKE 搜索标题、项目名和话题标签
3. **话题聚类** — 基于 Embedding 的余弦相似度对话分组

全部后端驱动，PG 是 title/tags 的唯一权威数据源。

## 架构

```
requirements_agent (自然语言 → 结构化需求)
    │
    ├── category_mapper ──────────┐
    ├── safety_assessor ──────────┤
    ├── constraint_extractor ─────┤
    └── title_generator (新增) ───┘  ← fan-out 并行，零额外延迟

        ... (现有图谱继续) ...

        END → SSE done 负载中附带 title + topic_tags
```

标题生成与已有 3 个节点并列 fan-out — 总图谱执行时间不变。

## 数据模型

### projects 表 — 新增 2 列

```python
title: Mapped[str | None] = mapped_column(String(200), nullable=True)
topic_tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)
```

### AnalysisState — 新增 2 个字段

```python
title: str | None
topic_tags: list[str] | None
```

### ProjectOut — 新增 2 个字段

```python
title: str | None = None
topic_tags: list[str] | None = None
```

数据权威链路：PG → 前端 localStorage 仅作展示缓存。

## 后端变更

### 1. title_generator 节点

- 接收 `state["user_input"]`
- 调用 `llm_service.generate_title_and_tags(user_input)` — 轻量 LLM 调用
- 成功返回 `{"title": "...", "topic_tags": ["...", "..."]}`
- 失败返回 `{"title": None, "topic_tags": None}`，不影响主流程

### 2. 图谱注册

```python
workflow.add_node("title_generator", title_generator)
workflow.add_edge("requirements_agent", "title_generator")
workflow.add_edge("title_generator", "selection_supervisor")
```

### 3. 数据库持久化

在 `analyze_project_v2` 和 `resume_project_analysis` 中，扩展最终 `update(Project)` 调用：

```python
await db.execute(
    update(Project).where(Project.id == project_id).values(
        status="ready",
        title=final_state.get("title"),
        topic_tags=final_state.get("topic_tags"),
    )
)
```

### 4. 搜索端点

```
GET /api/projects/search?q=<关键词>
```

- 在 `title`、`name` 和 `topic_tags`（JSONB 数组转字符串）上做 ILIKE 模糊匹配
- 按 `updated_at` 降序排列，最多返回 20 条
- 返回 `list[ProjectOut]`

### 5. 聚类端点

```
POST /api/projects/cluster
Body: { embedding_config: { api_key, base_url, model, dimension } }
```

- 查询所有 title 不为空的项目
- 通过 Embedding API 向量化每个项目的 title
- 两两计算余弦相似度，阈值 ≥ 0.75 归为一组
- 聚类标签取组内出现最多的 topic_tag

响应格式：
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

## 前端变更

| 文件 | 改动内容 |
|------|---------|
| `ConversationSidebar.tsx` | 搜索输入框（300ms 防抖）+ 聚类分组视图 + 时间/话题视图切换 |
| `ChatPanel.tsx` | 从 SSE `done` 事件解析 `title` + `topic_tags`，更新侧边栏缓存 |
| `store.ts` | `searchConversations()`、`clusterConversations()` 动作，`conversationViewMode` 状态 |
| `api.ts` | `searchProjects(q)`、`clusterProjects(config)` |
| `i18n.ts` | 搜索占位符、聚类标签、视图切换文字 |

## llm_service 变更

新增方法：
```python
async def generate_title_and_tags(self, user_input: str) -> dict:
    """根据用户自然语言输入，生成简洁标题和话题标签。"""
```

Prompt 示例："为以下工业自动化项目生成一个 2-6 字的中文标题和 2-4 个话题标签。以 JSON 返回：{title, topic_tags}。"

## 实现步骤

| 步骤 | 内容 | 涉及文件 |
|------|------|---------|
| 1 | projects 表加 title/topic_tags 列 + alembic 迁移 | `models.py`, 迁移文件 |
| 2 | 更新 AnalysisState + ProjectOut schema | `state.py`, `schemas.py` |
| 3 | llm_service 新增 generate_title_and_tags 方法 | `llm_service.py` |
| 4 | 新增 title_generator 节点 + 注册到图谱 | `agents.py`, `builder.py` |
| 5 | analysis.py 最终状态处理中持久化 title/tags | `analysis.py` |
| 6 | 搜索端点 | `projects.py` |
| 7 | 聚类端点 | `projects.py` |
| 8 | 前端：API 方法 | `api.ts` |
| 9 | 前端：store 动作 | `store.ts` |
| 10 | 前端：ConversationSidebar 搜索 + 聚类 UI | `ConversationSidebar.tsx` |
| 11 | 前端：ChatPanel SSE 解析 title/tags | `ChatPanel.tsx` |
| 12 | 前端：i18n 文案 | `i18n.ts` |

## 错误处理

- **标题生成失败** → 优雅降级，title 保持 null，用户无感知
- **搜索无结果** → 正常返回空列表，UI 显示"无匹配结果"
- **聚类 Embedding API 失败** → 全部项目归入 unclustered，附带警告信息
- **可聚类项目 ≤ 1 个** → 跳过计算，直接返回空 clusters
