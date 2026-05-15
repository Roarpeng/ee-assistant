# EE Assistant / Volta — 项目总览（2026-05-15）

> 本文档是当前 `feat/blueprint-ui-refresh` 分支的工程总结，覆盖：产品定位、整体架构、目录布局、数据模型、LangGraph 多 Agent 拓扑、记忆飞轮 M0–M3、API 全表、测试矩阵、部署与多 PC 开发交接。它替代了 2026-05-06 那版"产品方向小结 + 测试优化"摘要，作为后续迭代和换机开发的单一参考点。

---

## 1. 产品定位

Volta 是面向工业自动化领域的电气工程设计助手。核心闭环：

```
自然语言/需求文档
    ↓ requirements_agent + 澄清问答
结构化需求 (machine_type / safety / IO / 控制逻辑)
    ↓ category_mapper / safety_assessor / constraint_extractor (并行扇出)
功能单元 + 类别 + 约束
    ↓ selection_supervisor (Qdrant 语义 + 图谱 BFS + 历史 episode 注入)
候选 BOM
    ↓ rule_validator (5 条硬约束)
确认 BOM
    ↓ 并行扇出
schematic_generator / code_generator / wiring_generator / commissioning_generator / final_review
    ↓
原理图 + ST/SCL 代码 + 接线表 + 调试手册 + 评审报告
    ↓ topology 确认 + 反馈 + episode 记忆
导出包 + 工程记忆沉淀
```

中心设计法则保持不变：**Topology 是单一真相源 (source of truth)；BOM / IO / ST / 导出 / 记忆均派生自已确认的 topology。**

---

## 2. 整体架构

```
浏览器 :80
   │
   ▼
nginx (frontend 容器)
   ├── 静态文件 (React 18 SPA)
   ├── /api/* → backend:8000 (FastAPI, org_auth_middleware)
   │     ├── 项目 / 需求 / BOM / 原理图 / ST / 接线 / 调试
   │     ├── 知识库 (PDF/TXT/MD/HTML/DOCX/URL, 异步状态机)
   │     ├── 澄清问答 / 反馈 / 组织偏好 / 记忆来源
   │     ├── 记忆飞轮 (episodes / weekly_reports / admin_memory)
   │     └── LangGraph 11-Agent DAG (PostgresSaver 持久化 checkpoint)
   └── /ws/*  → backend:8000 (WebSocket, 分析进度 + 知识库进度)

数据层
   PostgreSQL 16 (pgvector)    — 业务表 + 知识图谱 + 记忆表 + langgraph_checkpoints
   Qdrant                       — 文档向量索引 (语义检索)
   MinIO                        — 原始文档存储 (PDF/DOCX/...)
```

部署：5 个 Compose 服务（frontend / backend / postgres / qdrant / minio），nginx 反向代理 API 超时 300s、上传 100MB、WS 超时 3600s。

---

## 3. 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 · TypeScript 5.6 · Vite 5 · Tailwind 3 · Zustand · ReactFlow 11 · Monaco · Mermaid · Yjs/y-webrtc · framer-motion · xlsx / html-to-image |
| 测试（前） | Vitest 2 + @testing-library/react + jsdom |
| 后端 | FastAPI 0.115 · WebSocket · SQLAlchemy 2 (async) · Pydantic v2 · alembic 1.13 · httpx |
| Agent 编排 | **LangGraph ≥ 0.2** StateGraph + **AsyncPostgresSaver**（跨重启可恢复） |
| 知识库 | Qdrant 1.11 (向量) + PostgreSQL 图表 (元件关系) |
| 图算法 | NetworkX + python-louvain（社区检测） |
| LLM | OpenAI 兼容协议（DeepSeek / Claude / GPT 都可），Chat + Embedding 双组独立配置 |
| 存储 | PostgreSQL 16 (pgvector image) · Qdrant · MinIO（S3 协议） |
| 部署 | Docker Compose 5 服务 |

---

## 4. 仓库目录布局（截至 2026-05-15）

```
ee-assistant/
├── backend/
│   ├── alembic/
│   │   └── versions/        # 10 个迁移：001 初始 → 007 记忆飞轮 M3
│   ├── app/
│   │   ├── main.py          # FastAPI 入口、lifespan、CORS、org_auth_middleware、WS 端点
│   │   ├── config.py        # Pydantic Settings (Chat/Embedding 双组配置)
│   │   ├── middleware/
│   │   │   └── org_auth.py  # 组织 Token → org_id 注入到 request.state
│   │   ├── api/             # 14 个 router（见 §6 API 全表）
│   │   ├── core/
│   │   │   ├── graph/       # LangGraph StateGraph + 11 Agent
│   │   │   ├── orchestrator.py            # WS 管理 + graph 启动 + 反馈/episode 捕获
│   │   │   ├── chat_orchestrator.py       # 快速 /chat 路径（非 LangGraph）
│   │   │   ├── llm_service.py             # OpenAI 兼容封装 + JSON 容错 + 重试
│   │   │   ├── rag_engine.py              # Qdrant 向量索引 + 运行时 embed 配置
│   │   │   ├── graph_rag.py               # 双路检索 (语义 + 图 BFS) 合并去重
│   │   │   ├── knowledge_graph.py         # 元件 / 边 CRUD + BFS
│   │   │   ├── entity_extractor.py        # LLM 实体抽取
│   │   │   ├── community_detector.py      # Louvain 社区检测
│   │   │   ├── rule_engine.py             # 5 条硬约束
│   │   │   ├── clarification_detector.py  # 自动检测需要澄清的字段
│   │   │   ├── commissioning_generator.py # 调试手册生成
│   │   │   ├── wiring_generator.py        # 接线表生成
│   │   │   ├── topology_lint.py           # 拓扑校验
│   │   │   ├── io_budget.py               # IO 余量计算
│   │   │   ├── plc_catalog.py             # PLC 选型目录
│   │   │   ├── bom_prices.py              # BOM 价格估算
│   │   │   ├── component_normalizer.py    # 元件命名归一
│   │   │   ├── component_taxonomy.py      # 元件分类树
│   │   │   ├── extractors.py              # PDF/TXT/MD/HTML/DOCX/URL 统一文本提取
│   │   │   ├── url_fetcher.py             # URL 单页抓取 (httpx, 800MB 上限)
│   │   │   ├── project_meta.py            # 项目元数据
│   │   │   ├── org_prefs_keys.py          # 组织偏好键定义
│   │   │   ├── org_prefs_service.py       # 组织偏好读写
│   │   │   ├── decisions_service.py       # M2: 决策捕获
│   │   │   ├── run_history_service.py     # M2: 运行历史
│   │   │   ├── episode_extractor.py       # M3: 运行 → episodic memory
│   │   │   ├── episode_retrieval.py       # M3: 注入历史 episode 到 supervisor
│   │   │   ├── consolidation_service.py   # M3: 周报 / 偏好整固
│   │   │   └── schemas.py                 # Pydantic 数据模型（统一入口）
│   │   └── db/
│   │       ├── models.py    # 17 张 ORM 表（见 §5）
│   │       └── repository.py
│   └── tests/               # 34 个测试文件，按 unit/api/integration 分层
├── frontend/
│   ├── nginx.conf
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── index.css
│       ├── hooks/
│       │   └── useChatHistory.ts
│       ├── models/
│       │   ├── store.ts            # Zustand 全局状态
│       │   └── yjsStore.ts         # Yjs 多端协作 store
│       ├── services/               # 按域拆分 + 同名 .test.ts
│       │   ├── api.ts              #   主 API 客户端
│       │   ├── conversations.ts    #   对话历史
│       │   ├── i18n.ts             #   中英文国际化
│       │   ├── budget.ts           #   IO 预算
│       │   ├── cabinet.ts          #   柜体
│       │   ├── procurement.ts      #   采购
│       │   ├── templates.ts        #   模板
│       │   ├── orgClient.ts        #   组织 / 偏好
│       │   ├── feedback.ts         #   反馈 (👍/👎/edit)
│       │   ├── memory.ts           #   episodes / 周报
│       │   └── templates/
│       └── views/components/
│           ├── AppLayout.tsx            # 主布局（左侧 sidebar + 中间 canvas + 右侧 chat）
│           ├── HeroLanding.tsx          # 首屏
│           ├── Header.tsx
│           ├── ThemeToggle.tsx
│           ├── ChatPanel.tsx            # 对话框 (SSE + JSON 双模式)
│           ├── ConversationSidebar.tsx  # 对话历史侧栏
│           ├── ClarifyCard.tsx          # 澄清问答卡片
│           ├── TopologyPanel.tsx        # ReactFlow 拓扑编辑器 (source of truth)
│           ├── CustomNodes.tsx          # 自定义 ReactFlow 节点
│           ├── CanvasContextMenu.tsx
│           ├── NodeInfoCard.tsx
│           ├── BOMPanel.tsx             # BOM 表 (含 i popover + 👎 + 编辑反馈)
│           ├── WiringPanel.tsx          # 接线表
│           ├── SCLPanel.tsx             # ST/SCL 代码 (Monaco)
│           ├── CabinetPanel.tsx         # 柜体规划
│           ├── IOBudgetBar.tsx          # IO 余量条
│           ├── InfoPanel.tsx
│           ├── GuidePanel.tsx
│           ├── KnowledgePanel.tsx       # 知识库（状态徽章 + 批量删除 + 重试）
│           ├── SettingsModal.tsx        # 设置（双组 LLM + 连通性测试）
│           ├── OrgSettingsPanel.tsx     # 组织偏好（含 clarify 写回）
│           ├── MemoryTab.tsx            # M3: episode 列表 + 周报 + consolidate-now
│           └── MemorySourcePopover.tsx  # 选型来源溯源
├── docs/
│   ├── PROJECT_OVERVIEW.md                                 # 本文档
│   ├── PROJECT_SUMMARY_AND_TEST_OPTIMIZATION.md            # 2026-05-06 历史摘要
│   ├── knowledge-bundle.md                                 # 知识库导出/导入
│   ├── topology-hardening-development-plan.md
│   └── superpowers/
│       ├── specs/   # 13 份设计稿
│       └── plans/   # 11 份实施计划
├── scripts/        # backup/restore_knowledge.{sh,ps1}
├── graphify-out/   # 知识图谱（graph.json + GRAPH_REPORT.md + graph.html）
├── docker-compose.yml
├── .env / .gitignore / .graphifyignore
├── CLAUDE.md       # Claude / Cursor 工作约定（架构问答先读 GRAPH_REPORT）
└── README.md
```

---

## 5. 数据模型（PostgreSQL，17 张表）

业务核心：

| 表 | 关键字段 | 说明 |
|---|---|---|
| `projects` | id, name, status, **org_id**, created_at | 项目主表 |
| `requirements` | project_id (1:1), machine_type, safety_level, environment, plc_family, raw_text | 结构化需求 |
| `io_items` | requirement_id, tag, io_type (DI/DO/AI/AO), description | IO 清单 |
| `logic_rules` | requirement_id, description | 控制逻辑文本 |
| `bom_items` | project_id, category, manufacturer, model, qty, specifications, confidence(rag/llm/mixed), source_chunk_id, alternatives | 选型 BOM |
| `schematics` | project_id (1:1), mermaid_code, svg_data | 原理图 |
| `st_modules` | project_id, name, module_type(OB/FC/FB/DB), code, sort_order | ST 代码模块 |
| `project_topologies` | project_id, version, status(draft/confirmed), source(user/ai/imported/memory), snapshot(JSON), created_at, confirmed_at | **拓扑快照（source of truth）** |
| `chat_messages` | project_id, role, content, options, sequence, created_at | 对话历史 |

知识库：

| 表 | 说明 |
|---|---|
| `knowledge_docs` | id, filename, manufacturer, category_tags, chunk_count, status(uploading→chunking→embedding→graph_extracting→ready/error), source_type(pdf/txt/md/html/docx/url), source_url, uploaded_at |
| `component_nodes` | id, name, component_type, properties, community, source_doc_id (FK SET NULL) |
| `component_edges` | source_id → target_id, relation(REQUIRES_POWER / OUTPUTS_SIGNAL / USES_PROTOCOL / COMPATIBLE_WITH / ALTERNATIVE_TO / MOUNTS_ON / CONTROLS), confidence, source_doc_id |

组织 / 多租户：

| 表 | 说明 |
|---|---|
| `organizations` | id, name, code (unique), token_hash (sha256, unique) — `org_auth_middleware` 用 Token 解析 org_id |
| `org_preferences` | (org_id, key) 复合主键, value(JSON), confidence, source(clarify/admin/inferred) — 组织级"默认值" |

记忆飞轮（M2 / M3）：

| 表 | 引入版本 | 说明 |
|---|---|---|
| `decisions` | M2 | type ∈ {manual_select, bom_edit, wiring_edit, topology_edit, thumbs_down, clarify}，捕获用户对 AI 建议的偏离/确认 |
| `run_history` | M2 | 每次 analysis 运行的 telemetry：nodes_executed(ms 字典)、errors、final_stage |
| `selection_weights` | M2 | (org_id, category, manufacturer, model) 权重累加器，反向偏置 `selection_supervisor` 的候选排序 |
| `episodic_memories` | M3 | 每次完成运行的"一句话摘要 + key_decisions" + requirement / bom snapshot，供后续运行的 supervisor 注入历史上下文 |
| `weekly_memory_reports` | M3 | 周度睡眠期整固：new_rules（manual_select ≥3 次的元组）、revisions、gaps（thumbs_down）、metrics |

LangGraph 内部：`langgraph_checkpoints` 由 `AsyncPostgresSaver.setup()` 自动创建，跨重启可恢复每个 `project_id` 的 graph state。

外键策略：`component_nodes.source_doc_id` / `component_edges.source_doc_id` 设 `ON DELETE SET NULL`，删文档时知识图保留。`org_preferences.org_id` `ON DELETE CASCADE`。

迁移版本（按依赖序）：
- `001_initial_tables` → `a4d5b3e39d74_add_component_graph_tables` → `002_add_knowledge_status_and_fk_ondelete` → `002_langgraph_checkpoint` → `003_add_knowledge_source_type_and_url` → `003_chat_messages` → `004_organizations` → `005_projects_org_fk` → `006_decisions_runhistory_weights` → `007_episodic_memories_and_reports`

---

## 6. API 全表

> 前缀统一：REST `/api/*`，WebSocket `/ws/*`。所有需要鉴权的 REST 端点先经 `org_auth_middleware` 解析 Token → `request.state.org_id`。

### 系统

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| POST | `/api/test-connectivity` | Chat + Embedding 双组连通性测试（前端设置面板） |

### 项目 / 分析

| 方法 | 路径 | 说明 |
|---|---|---|
| GET, POST | `/api/projects` | 列表 / 创建 |
| GET, DELETE | `/api/projects/{id}` | 详情 / 删除 |
| POST | `/api/projects/{id}/analyze` | v1 串行需求分析 |
| POST | `/api/projects/{id}/analyze-v2` | **★ LangGraph 全流程**（11 Agent，PostgresSaver） |
| POST | `/api/projects/{id}/chat` | 快速对话路径（不走 LangGraph，使用 history + canvas） |
| POST | `/api/projects/{id}/schematic` | 原理图生成 |
| POST | `/api/projects/{id}/codegen` | ST 代码生成 |
| POST | `/api/projects/{id}/clarify` | 提交澄清答复（写回需求 + 可选 org_pref） |
| GET, POST | `/api/projects/{id}/topology` | 读取最新草稿 / 保存新版本 |
| POST | `/api/projects/{id}/topology/confirm` | 确认 topology → 触发派生 |

### 知识库

| 方法 | 路径 | 说明 |
|---|---|---|
| GET, POST | `/api/knowledge/docs` | 列表 / 上传（多文件，异步）|
| DELETE | `/api/knowledge/docs` | 批量删除 `{ids: [...]}` |
| DELETE | `/api/knowledge/docs/{id}` | 删单文档（联级清 Qdrant chunk） |
| POST | `/api/knowledge/docs/{id}/retry` | 重试失败文档（从 MinIO 重读） |
| POST | `/api/knowledge/urls` | 单页 URL 抓取入库 |
| POST | `/api/knowledge/search` | 直接搜索（调试用） |

### 对话历史

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects/{id}/messages` | 取项目对话历史 |
| POST | `/api/projects/{id}/messages` | 追加消息 |

### 组织 / 偏好 / 反馈 / 记忆

| 方法 | 路径 | 说明 |
|---|---|---|
| GET, POST | `/api/orgs/me` | 当前组织详情 |
| GET, PUT | `/api/orgs/me/preferences` | 组织级默认值（k/v 列表） |
| POST | `/api/feedback/{type}` | M2: 反馈写入 `decisions` 表（manual_select / bom_edit / wiring_edit / topology_edit / thumbs_down / clarify） |
| GET | `/api/memory-sources` | 选型项的来源溯源（RAG chunk / graph 邻居 / episode / 规则） |
| GET | `/api/episodes` | M3: 当前 org 的最近 N 条 episodic memory |
| GET, POST | `/api/admin/memory` | M3: 周报 / consolidate-now / 偏好整固 |

### WebSocket

| 路径 | 说明 |
|---|---|
| `/ws/projects/{id}` | 分析过程的阶段事件（requirements / mapping / safety / selection / rules / schematic / codegen / wiring / commissioning / final_review） |
| `/ws/knowledge/docs/{id}` | 文档处理 6 阶段进度（uploading → chunking → embedding → graph_extracting → ready / error） |

---

## 7. LangGraph 多 Agent 拓扑（11 节点）

```
              START
                │
                ▼
        requirements_agent
        ┌───────┼───────┐
        ▼       ▼       ▼
category_mapper  safety_assessor  constraint_extractor
        └───────┼───────┘
                ▼
        selection_supervisor
        （扇出执行子任务，并合并：
         · Qdrant 语义检索
         · 图谱 BFS 邻居遍历
         · 历史 episodic memory 注入（M3）
         · selection_weights 偏置（M2））
                │
                ▼
          rule_validator
        （5 条硬约束）
   ┌────┬────┬────┬────┬────┐
   ▼    ▼    ▼    ▼    ▼    ▼
schematic_  code_  wiring_  commissioning_  final_review
generator   gen    generator generator       _agent
   └────┴────┴────┴────┴────┘
                ▼
               END
```

关键特性：
- 状态通过 `AnalysisState` (TypedDict, `Annotated` reducer 处理并行合并) 在节点间流转
- **`AsyncPostgresSaver`** 持久化 checkpoint，`thread_id = project_id`；容器重启或更换实例后可断点续跑
- selection_supervisor 是"双路检索 + 历史偏置"的核心融合点
- 新旧端点共存：`/analyze`（v1 串行，留作快速回归） + `/analyze-v2`（v2 LangGraph）

5 条选型硬约束（`core/rule_engine.py`）：
1. `check_breaker_rating` — 断路器额定电流 ≥ 总负载 × 1.25
2. `check_sil_redundancy` — SIL2+ 强制冗余安全继电器
3. `check_protocol_compatibility` — 柜内设备协议统一 (PROFINET / PROFIBUS / EtherCAT)
4. `check_voltage_matching` — 线圈电压匹配控制电压
5. `check_motor_starter_match` — 电机功率 ≤ 接触器/热继电器额定

---

## 8. 记忆飞轮 (Memory Flywheel) — 已落地版本

设计参考：OpenViking 的 session-commit、Mem0 的离散语义事实、Zep/Graphiti 的时序图记忆、Letta/MemGPT 的分层上下文加载。但所有结构都以 **engineering artifacts** 为载体，而不是通用聊天记忆。

七类一级记忆：

| 类型 | 用途 | 当前实现 |
|---|---|---|
| `user_preference` | 用户/组织默认偏好 | ✅ `org_preferences` |
| `project_case` | 已导出的工程项目案例 | ✅ `episodic_memories` |
| `function_pattern` | 可复用功能/机电模式 | 🟡 规划中（M4） |
| `standard_rule` | 标准与校验约束 | ✅ `rule_engine` 内置 5 条 |
| `component_fact` | 元件结构化事实 | ✅ `component_nodes` + `component_edges` |
| `topology_revision` | 拓扑编辑学习 | ✅ `decisions(type=topology_edit)` |
| `validation_lesson` | 校验失败与采纳的修复 | 🟡 规划中（M4） |

里程碑实施状态：

| 里程碑 | 范围 | 状态 |
|---|---|---|
| **M0** | 基础设施：组织表 + Token 鉴权中间件 + LangGraph PostgresSaver | ✅ |
| **M1** | 澄清问答与组织偏好写回（clarify → org_pref） | ✅ |
| **M2** | 决策捕获 + 运行历史 + 选型权重 + 反馈 API + UI 钩子（👍/👎/edit）+ memory-sources | ✅ |
| **M3** | episodic_memories + episodes API + consolidation 周报 + memory tab UI + episode 注入 supervisor | ✅ |
| **M4** | function_pattern / validation_lesson 显式抽取 + Qdrant hybrid search（episode embedding） | 待启动 |

**关键路径文件**（M2/M3）：
- `core/decisions_service.py` / `api/feedback.py` / `tests/test_api_feedback.py`
- `core/run_history_service.py` / `tests/test_run_history_capture.py`
- `core/episode_extractor.py` / `core/episode_retrieval.py` / `core/consolidation_service.py`
- `api/episodes.py` / `api/admin_memory.py` / `api/memory_sources.py`
- `frontend/src/views/components/MemoryTab.tsx` / `MemorySourcePopover.tsx`

---

## 9. 知识库状态机

```
POST /api/knowledge/docs   (201 立即返回, status=uploading)
   │
   ▼
uploading → chunking → embedding → graph_extracting → ready
     │         │         │                │
     └─────────┴─────────┴────────────────┴─→ error  (异常时, 可点 ↻ 重试)
```

- 原始字节存 MinIO，失败重试无需重新上传
- 文本提取统一走 `core/extractors.py`，按后缀 + MIME 双重匹配（PDF=PyMuPDF / DOCX=python-docx / HTML=BeautifulSoup / MD/TXT 直读）
- URL 通道：`POST /api/knowledge/urls`，httpx 单页抓取，800MB 上限，不跟链
- 重试：`POST /api/knowledge/docs/{id}/retry`，从 MinIO 重读后重新走 dispatch
- 进度推送：`WS /ws/knowledge/docs/{id}`

**知识库 bundle 跨部署共享**：`scripts/backup_knowledge.{sh,ps1}` 打包 Qdrant snapshot + `pg_dump`（knowledge_docs / component_nodes / component_edges / alembic_version）+ MinIO bucket，含 `manifest.json` 校验 embed model & dim，不匹配自动中止保护。`scripts/restore_knowledge.{sh,ps1}` 在新部署上一键恢复。详见 `docs/knowledge-bundle.md`。

---

## 10. 测试矩阵（截至当前分支 34 个测试文件）

| 类别 | 范围 | 代表文件 |
|---|---|---|
| **unit** | 纯逻辑 | `test_rule_engine.py` / `test_io_budget.py` / `test_plc_catalog.py` / `test_topology_lint.py` / `test_component_normalizer.py` / `test_clarification_detector.py` / `test_schemas.py` / `test_bom_prices.py` |
| **api**  | FastAPI + SQLite | `test_api_topology.py` / `test_api_analysis.py` / `test_api_messages.py` / `test_api_orgs.py` / `test_api_feedback.py` / `test_api_episodes.py` / `test_api_admin_memory.py` / `test_chat_orchestrator.py` |
| **integration** | 需要 Qdrant / Postgres / MinIO | `test_rag_engine.py` / `test_api_knowledge.py` / `test_postgres_checkpointer.py` |
| **memory** | M2/M3 行为 | `test_consolidation_service.py` / `test_episode_extractor.py` / `test_episode_retrieval.py` / `test_run_history_capture.py` / `test_selection_weight_bias.py` / `test_memory_sources.py` / `test_clarify_writeback.py` |
| **生成器** | 派生产物 | `test_commissioning_generator.py` / `test_wiring_generator.py` / `test_requirements_enrichment.py` |
| **幂等性** | analyze 复跑 | `test_analyze_idempotent.py` / `test_conversation_enhancements.py` |
| **frontend (Vitest)** | UI + service | `BOMPanel.test.tsx` / `ChatPanel`（间接） / `ClarifyCard.test.tsx` / `HeroLanding.test.tsx` / `InfoPanel.test.tsx` / `GuidePanel.test.tsx` / `WiringPanel.test.tsx` / `MemoryTab.test.tsx` / `MemorySourcePopover.test.tsx` / `OrgSettingsPanel.test.tsx` / `budget.test.ts` / `cabinet.test.ts` / `procurement.test.ts` / `templates.test.ts` / `feedback.test.ts` / `memory.test.ts` / `orgClient.test.ts` |

推荐运行：

```bash
cd backend && python -m pytest tests -m "not integration" -q
cd backend && python -m pytest tests -m integration -q   # 需起 Qdrant/Postgres/MinIO
cd frontend && npm ci && npm run test && npm run build
```

Docker 端到端：

```bash
docker compose up -d --build postgres qdrant minio backend frontend
docker exec ele-backend-1 alembic upgrade head
docker exec ele-backend-1 python -m pytest tests -q
docker compose down -v
```

---

## 11. 前端设计系统

**B/C 融合风格**：Linear/Notion 的干净感 + VS Code/GitHub 的工程工具气质。

- **主题**：CSS 变量驱动，`data-theme="light|dark"`，localStorage 持久化
- **字体**：Inter（UI）+ JetBrains Mono（代码）
- **令牌前缀**：`app-` → `bg-app-bg-primary`、`text-app-text-secondary`、`rounded-app-md`、`shadow-app-sm`
- **分栏**：左侧 20%–50% 可拖拽，中间 1px 分隔线 hover 高亮
- **拓扑画布**：ReactFlow + 自定义节点（电源 / PLC / 驱动器 / 安全设备 / 传感器 / 执行器），右键菜单提供常见操作
- **协作**：`yjsStore.ts` 接入 Yjs + y-webrtc，为多端实时编辑预留通道（默认未启用，由 store 切换）
- **导出**：xlsx（BOM / 接线表）+ html-to-image（拓扑图 PNG）

---

## 12. 部署 / 运维

```bash
docker compose up -d --build
docker exec ele-backend-1 alembic upgrade head
# 前端 → http://localhost:8090   (compose 中映射到 8090)
# 后端 → http://localhost:8000   (API docs: /docs)
```

注意点：
- backend 容器同时配置了 `HTTP_PROXY=host.docker.internal:3128`（用于 LLM 出网）和 `NO_PROXY=postgres,qdrant,minio,...`（保证容器内服务直连）
- `extra_hosts: host.docker.internal:host-gateway` 在 Linux 容器中必须显式声明
- 数据卷：`postgres_data` / `qdrant_data` / `minio_data`，跨主机迁移走 §9 的 bundle
- 反向代理：`frontend/nginx.conf` API 超时 300s、上传 100MB、WS 超时 3600s

---

## 13. 开发约定

- **TDD**：先写测试，后写实现（pytest + pytest-asyncio + aiosqlite for 快速 api 测试）
- **MVS 分层**：前端 Model（Zustand + types） / View（React 组件） / Service（API 客户端）严格分离
- **统一 LLM 入口**：`llm_service.chat(system, user)`，不直接调 SDK
- **环境变量**：`.env` 管理 API key，不硬编码
- **API 前缀**：REST `/api/`、WS `/ws/`
- **Graphify**：代码修改后跑 `graphify update .` 刷新知识图谱（AST-only，无 API 成本）；架构问题先读 `graphify-out/GRAPH_REPORT.md` 而不是直接 grep
- **Alembic**：所有 schema 变更走 Alembic 迁移，禁止依赖 `create_all` 上线

---

## 14. 当前分支 `feat/blueprint-ui-refresh` 已交付要点

1. **UI 重构 (Blueprint refresh)**：HeroLanding、Header、AppLayout、新的 Hero / Guide / Info 三联面板，主题/字体令牌全面切换为 `app-` 前缀
2. **拓扑作为单一真相源**：`ProjectTopology` 模型 + draft/confirm + 前端 TopologyPanel 与 ReactFlow 自定义节点
3. **快速对话通道**：`POST /api/projects/{id}/chat` + `chat_orchestrator.py` + 前端在"首次完整生成 vs 后续讨论"之间的智能路由
4. **澄清问答**：自动检测缺失字段 → ClarifyCard → `/clarify` 写回需求 + 可选 org_pref
5. **组织 / 偏好**：org 表 + token 鉴权 + 偏好读写 + OrgSettingsPanel
6. **记忆飞轮 M2 + M3 全栈落地**：见 §8
7. **派生产物完整化**：`wiring_generator` 接线表 + `commissioning_generator` 调试手册 + `bom_prices` 价格估算 + `io_budget` 余量
8. **LangGraph 升级**：从 `MemorySaver`（内存）→ `AsyncPostgresSaver`（Postgres 持久化），新增 `langgraph_checkpoints` 表与 002_langgraph_checkpoint 迁移
9. **测试矩阵扩张**：从 ~10 个增长到 34 个测试文件，前端 Vitest 用例覆盖关键 UI

---

## 15. 后续路线（建议优先级）

1. **M4 记忆扩展**：function_pattern / validation_lesson 抽取、Qdrant hybrid search（episode embedding）
2. **导出包**：从 confirmed topology 一键生成 .zip（BOM xlsx + 接线表 xlsx + ST .scl + 原理图 svg + 调试手册 md + 项目元数据 json）
3. **ABCD 模式种子**：气缸往复 / 伺服回原点 / 单变频输送 / 控制柜底盘，落到 `function_pattern` 表
4. **CI 流水线**：固化 §10 的"快 CI"和"Docker 全量 CI"两套，加 PR gates
5. **graphify update 自动化**：commit hook 或 nightly job 自动刷新 `graphify-out/`
6. **拓扑校验深化**：`topology_lint.py` 接入 IO 余量 / 协议一致性 / 安全等级三项联动校验
7. **多端协作打开**：Yjs/y-webrtc 通道默认开启，加 awareness 头像 + 选择高亮

---

## 16. 换机 / 多 PC 接手指南（给未来的你）

新机器从零启动开发的标准动作：

```bash
git clone https://github.com/Roarpeng/ee-assistant.git
cd ee-assistant
git checkout feat/blueprint-ui-refresh

cp .env.example .env   # 如不存在，参照 .env 现有键填入（DeepSeek/SiliconFlow API key 等）

docker compose up -d postgres qdrant minio
cd backend && pip install -r requirements.txt && PYTHONPATH=. alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
cd ../frontend && npm install && npm run dev

# 知识库一键复刻（如果有上一台导出的 bundle）
./scripts/restore_knowledge.sh path/to/knowledge-bundle-YYYYMMDD.tgz
```

或者全 Docker：

```bash
docker compose up -d --build
docker exec ele-backend-1 alembic upgrade head
# → http://localhost:8090
```

**架构问题先看**：`graphify-out/GRAPH_REPORT.md` → `docs/superpowers/specs/` 最新设计稿 → 本文档 → `CLAUDE.md`。
