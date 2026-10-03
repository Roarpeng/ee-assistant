# Volta — 电气工程设计 AI 工作台 (Topology-First, LangGraph Multi-Agent)

> 面向工业自动化的电气工程设计助手：自然语言/需求文档 → 需求拆解 → 双路 RAG 选型 → 规则校验 → 派生产物（原理图 / EPlan XML / 接线表 / 调试手册）。
> **中心法则：拓扑图 (Topology) 是单一真相源**——BOM、接线表、代码、导出、记忆全部派生自已确认的拓扑。
>
> ⚠️ 本文档与 `CLAUDE.md` 内容一致，改动时请两份同步。代码真相源优先级：代码 > `docs/PROJECT_OVERVIEW.md` > 本文档。

## 快速开始

```bash
# 全 Docker 一键部署（推荐）
cp .env.example .env   # 可选：后端默认 LLM 兜底
docker compose up -d --build
# backend 容器启动时自动执行 alembic upgrade head（幂等），无需手动迁移
# → 前端 http://localhost:8090   (compose 映射 8090:80)
# → 后端 http://localhost:8001   (compose 映射 8001:8000)
# → API 文档 http://localhost:8001/docs
```

```bash
# 本地开发模式（基础设施用 Docker，前后端裸跑）
docker compose up -d postgres qdrant minio
cd backend && pip install -r requirements.txt && PYTHONPATH=. alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
cd frontend && npm install && npm run dev   # → http://localhost:5173
```

```bash
# 测试
cd backend && PYTHONPATH=. python -m pytest tests/ -q
cd frontend && npm ci && npm run test && npm run build
```

## 技术栈

| 层 | 选型 |
|---|------|
| 前端 | React 18 · TypeScript · **MUI 6 (Material Design 3)** · Tailwind 3（工具类补充）· Zustand · ReactFlow · Monaco · Mermaid · Yjs/y-webrtc · xlsx/jszip |
| 后端 | FastAPI · WebSocket · SQLAlchemy 2 (async) · Pydantic v2 · Alembic |
| LLM | OpenAI-compatible（DeepSeek / 百炼 DashScope / 火山方舟 / GPT 等），前端可配 **Chat + Embedding 双组 API**，后端 `/api/llm-providers` 提供厂商注册表单一真相源 |
| Agent 编排 | **LangGraph** StateGraph + **AsyncPostgresSaver**（sqlite 环境下自动退化为 MemorySaver），14 节点有状态 DAG，4+5 两路 fan-out + 原理图派生链 |
| 知识库 | Qdrant（向量）+ **PostgreSQL 图表**（元件关系图）+ 词法搜索（ILIKE，PG 上 pg_trgm 索引）|
| 图算法 | NetworkX · python-louvain（社区检测）|
| 存储 | PostgreSQL 16 (pgvector) · Qdrant · MinIO (S3) |
| 部署 | Docker Compose 5 服务 + **健康检查 + 依赖就绪条件** |

## 项目结构

```
ele/
├── backend/app/
│   ├── main.py                    # FastAPI 入口, lifespan(create_all 兜底 + Qdrant 集合), org_auth_middleware
│   │                              #   /api/health, /api/test-connectivity, /api/llm-providers,
│   │                              #   /api/tasks, /api/debug/log (前端错误上报), 2 个 WS 端点
│   ├── config.py                  # Pydantic Settings (Chat/Embedding 双组配置, 多厂商 alias 回退)
│   ├── middleware/org_auth.py     # 组织 Token → request.state.org_id
│   ├── api/                       # 15 个 router（见 API 端点一览）
│   │   ├── projects.py            #   项目 CRUD + 文本搜索 + cluster（主题标签聚类侧栏）
│   │   ├── analysis.py            #   /analyze (v1 串行) + /analyze-v2 (LangGraph SSE) + /chat + /resume
│   │   ├── selection.py           #   选型（v2 已并入 graph，端点保留兼容）
│   │   ├── schematic.py           #   原理图生成 (v1 mermaid 框图)
│   │   ├── schematic_v2.py         #   ★ 电路级原理图页 (IR+SVG 派生/列表/单页)
│   │   ├── codegen.py             #   ★ EPlan XML 生成（确定性生成 + LLM 生成校验择优）
│   │   ├── topology.py            #   ★ 拓扑快照读写 + confirm（真相源）
│   │   ├── knowledge.py           #   知识库: 上传/URL/重试/批量删除 + 元件图 CRUD
│   │   ├── messages.py            #   对话历史
│   │   ├── orgs.py                #   组织 + 组织偏好
│   │   ├── clarify_answer.py      #   澄清问答写回
│   │   ├── feedback.py            #   ★ 反馈捕获 (select/edit/negative → decisions)
│   │   ├── memory_sources.py      #   ★ 选型来源溯源 (RAG chunk/图邻居/episode/规则)
│   │   ├── episodes.py            #   ★ 组织 episodic memory 列表
│   │   ├── admin_memory.py        #   ★ 记忆整固 (consolidate-now / 周报 / apply)
│   │   └── search.py              #   ★ 统一搜索 (向量+词法 RRF 融合: knowledge/components/projects)
│   ├── core/
│   │   ├── graph/                 #   ★ LangGraph 14 节点系统 ★
│   │   │   ├── state.py           #     AnalysisState (TypedDict + Annotated reducers)
│   │   │   ├── agents.py          #     14 个节点 (RAG/拓扑/原理图 IR/LLM 评审, 全部容错回退)
│   │   │   └── builder.py         #     StateGraph 构建 + checkpointer 选择 (PG/sqlite)
│   │   ├── orchestrator.py        #   WS 进度 + graph 启动 + 反馈/episode 捕获 + run_history
│   │   ├── chat_orchestrator.py   #   ★ 快速 /chat 路径 + 答案质检 (拒空答/占位符/敷衍)
│   │   ├── llm_service.py         #   OpenAI-compatible 封装, JSON 容错 + 重试 + RateLimit backoff
│   │   ├── llm_providers.py       #   ★ 厂商注册表 (dashscope/volcengine/deepseek/... 含多模态 embedding 特判)
│   │   ├── rag_engine.py          #   Qdrant 向量索引 + 运行时 embed 配置
│   │   ├── graph_rag.py           #   双路检索 (Qdrant 语义 + 图 BFS) 合并去重
│   │   ├── unified_search.py      #   ★ RRF 融合 + 图词法搜索 + 项目文本搜索 (纯函数核心可测)
│   │   ├── knowledge_graph.py     #   元件/边 CRUD + BFS 遍历
│   │   ├── entity_extractor.py    #   LLM 实体抽取
│   │   ├── community_detector.py  #   Louvain 社区检测
│   │   ├── rule_engine.py         #   5 条硬约束选型校验
│   │   ├── clarification_detector.py # 自动检测需要澄清的字段
│   │   ├── topology_lint.py       #   拓扑校验 (节点/悬空边/电源链路)
│   │   ├── component_taxonomy.py  #   元器件类型+协议规范集合 (KG/拓扑双体系)
│   │   ├── component_normalizer.py#   类型/协议归一化双通道
│   │   ├── wiring_generator.py    #   接线表生成 (确定性)
│   │   ├── commissioning_generator.py # 调试手册生成
│   │   ├── schematic/             #   ★ 电路级原理图包: ir/symbols(IEC60617)/netlist(线号+交叉引用)
│   │   │                           #     power/control/io 生成器 + builder + svg_render(A3 图幅)
│   │   ├── io_budget.py           #   IO 余量计算
│   │   ├── bom_prices.py          #   BOM 价格估算
│   │   ├── plc_catalog.py         #   PLC 选型目录
│   │   ├── extractors.py          #   PDF/TXT/MD/HTML/DOCX/URL 统一文本提取 (后缀+MIME 双匹配)
│   │   ├── url_fetcher.py         #   URL 单页抓取 (httpx, 800MB 上限, 不跟链)
│   │   ├── project_meta.py        #   项目元数据 (InfoPanel)
│   │   ├── clustering.py          #   项目主题聚类
│   │   ├── org_prefs_keys.py / org_prefs_service.py  # 组织偏好
│   │   ├── decisions_service.py   #   M2: 决策捕获
│   │   ├── run_history_service.py #   M2: 运行遥测 (start/finish)
│   │   ├── episode_extractor.py   #   M3: 完成运行 → episodic memory
│   │   ├── episode_retrieval.py   #   M3: 注入历史 episode 到 supervisor (SQL recency; M4 换 Qdrant hybrid)
│   │   ├── consolidation_service.py # M3: 周报/偏好整固
│   │   ├── task_tracker.py        #   后台任务注册表
│   │   ├── logging_config.py      #   结构化日志
│   │   └── schemas.py             #   Pydantic 模型 (含 ModuleType.XML)
│   └── db/
│       ├── models.py              #   20 张 ORM 表
│       └── repository.py          #   AsyncEngine + 连接池
├── backend/alembic/versions/      # 迁移链 001→010 单头 (002/005/009 带 SQLite 方言守卫)
├── backend/tests/                 # 44 个测试文件 (含 schematic 5 件套 + test_alembic_schema_sync 防 model↔迁移漂移)
├── frontend/
│   ├── nginx.conf                 #   /api/* → backend:8000 (600s, 800MB, SSE 无缓冲), /ws/* → (3600s)
│   └── src/
│       ├── hooks/                 # useDebounce, useChatHistory, useReconnectingWS (指数退避)
│       ├── models/                # store.ts (Zustand 全局状态) + yjsStore.ts (Yjs 协同)
│       ├── services/              # 按域拆分的 API 客户端 (api/conversations/i18n/budget/cabinet/
│       │                          #   procurement/templates/orgClient/feedback/memory/exportPackage/spreadsheet...)
│       ├── theme/md3.ts           # ★ MUI Material Design 3 主题 (light/dark/engineering)
│       ├── utils/                 # gravityLayout (5 层重力对齐), analysisRouting (chat/analyze 智能路由)
│       └── views/components/      # AppLayout(三栏) · ChatPanel(SSE+JSON) · ConversationSidebar(聚类)
│                                  # TopologyPanel(ReactFlow 真相源) · CustomNodes · NodeInfoCard · CanvasContextMenu
│                                  # BOMPanel(置信度+反馈+来源溯源) · SCLPanel(Monaco EPlan XML) · WiringPanel
│                                  # CabinetPanel · IOBudgetBar · KnowledgePanel(6色状态+批量删除+重试)
│                                  # ClarifyCard · SettingsModal(双组 LLM+连通性测试) · OrgSettingsPanel
│                                  # MemoryTab(episode+周报) · MemorySourcePopover · ReportExporter(ZIP 导出)
│                                  # InfoPanel · GuidePanel · HeroLanding · ConfirmDialog · ErrorBoundary · GlobalToast
├── docker-compose.yml             # 5 服务 + healthchecks (pg_isready / qdrant TCP / minio live / backend health)
├── .github/workflows/ci.yml       # CI: backend pytest(sqlite) + frontend npm ci/test/build
├── scripts/                       # backup/restore_knowledge.{sh,ps1}
└── docs/                          # PROJECT_OVERVIEW / LANGGRAPH_FLOW / API_DOCUMENTATION / DEPLOYMENT / ... + superpowers 设计稿
```

## LangGraph 14 节点 DAG

```
START → requirements_agent (自然语言 → 结构化需求 + org 偏好富化)
           │
     ┌─────┼─────┬──────────┐     4 路 fan-out
     ▼     ▼     ▼          ▼
  Category  Safety  Constraint  Title
  Mapper  Assessor  Extractor  Generator
     │      │        │          │
     └──────┼────────┼──────────┘
            ▼
  selection_supervisor  ←── 双路检索 (Qdrant 语义 + 图谱 BFS) + 历史 episode 注入 (M3) + selection_weights 偏置 (M2)
            │
            ▼
     rule_validator (5 条硬约束)
            │
  ┌────┬────┼────┬────┐            5 路 fan-out
  ▼    ▼    ▼    ▼    ▼
Schematic Code  Final Commissioning Wiring
Generator Gen   Review  Generator  Generator
(EPlan XML)
  │ (拓扑产出后接原理图派生链)
  ▼
schematic_ir_builder (确定性: 主回路/控制/IO 页 IR + 线号 + 交叉引用)
            ▼
schematic_reviewer (LLM 评审/翻译 logic_rules, 校验门控)
  └────┴────┴────┴────┘
            ▼
           END
```

- 状态通过 `AnalysisState` TypedDict 流转；`graph_traces/errors/messages` 用 `Annotated` reducer 合并并行结果
- checkpointer：`DATABASE_URL` 含 `sqlite` 时用 MemorySaver（本地/测试），否则 `AsyncPostgresSaver`（生产，thread_id = project_id，跨重启断点续跑）
- 进度经 WS `/ws/projects/{id}` 实时推送，`run_history` 记录每节点耗时与错误
- v1 `/analyze`（串行）与 v2 `/analyze-v2`（LangGraph）共存；`/chat` 是免 graph 的快速问答通道

## 拓扑图生成管线

```
BOM + 需求 → LLM generate_topology_json() → _normalize_topology() → 自动连线器 → lint 校验
                        ↓ (失败时)
               _build_fallback_topology() (规则兜底, 保证永远有可确认的拓扑)
```

- **5 层工业层级**：L0 Power → L1 Protection → L2 Control → L3 Execution → L4 Feedback
- **双类型体系**：KG 体系 (plc_cpu/io_module) vs 拓扑体系 (plc/io) — `component_normalizer.py` 双通道归一化
- **自动连线**：按类型匹配 (estop→safety_relay, safety_door→safety_plc, plc→signal_light 等)，`topology_lint.py` 校验后兜底
- **前端**：ReactFlow + Yjs CRDT 协同，自定义节点 (PLC/HMI/IO/VFD/急停/安全门/信号灯…)，5 层重力对齐 (`utils/gravityLayout.ts`)，3 物理重叠句柄
- **电路级原理图派生**：拓扑确认 → `core/schematic/` 确定性生成主回路(三相母线+支路)/控制回路(梯形图+线号+交叉引用)/IO 页(端子排) → A3 SVG (`schematic_pages` 表)，LLM 仅评审 (`docs/superpowers/specs/2026-10-03-schematic-generator-design.md`)
- **电路级原理图派生**：拓扑确认 → `core/schematic/` 确定性生成主回路(三相母线+支路)/控制回路(梯形图+线号+交叉引用)/IO 页(端子排) → A3 SVG (`schematic_pages` 表)，LLM 仅评审 (`docs/superpowers/specs/2026-10-03-schematic-generator-design.md`)

## 元件知识图谱

```
component_nodes:  id | name | component_type | properties(JSONB) | community | source_doc_id
component_edges:  id | source_id → target_id | relation | properties(JSONB) | confidence
```

**7 种电气关系**：`REQUIRES_POWER` | `OUTPUTS_SIGNAL` | `USES_PROTOCOL` | `COMPATIBLE_WITH` | `ALTERNATIVE_TO` | `MOUNTS_ON` | `CONTROLS`

1. 文档上传 → extractors 提取文本
2. 向量路径：chunk → embedding → Qdrant
3. 图路径：LLM 实体抽取 → 关系抽取 → upsert PG → Louvain 社区检测
4. 选型时：Qdrant 语义 + 图 BFS 双路检索，结果合并去重；另有 RRF 统一搜索通道

## 记忆飞轮 (Memory Flywheel)

把用户对 AI 建议的偏离沉淀为组织级信号，反哺下一次选型：

```
decisions (manual_select/bom_edit/wiring_edit/topology_edit/thumbs_down/clarify)
    ├─→ selection_weights (org×品类×型号 权重 → 偏置 supervisor 排序)
    ├─→ run_history (每次运行遥测)
    └─→ episodic_memories (运行蒸馏成摘要+关键决策) ──→ 注入后续 supervisor 提示词
                                                        └─→ weekly_memory_reports (consolidation 整固: ≥3 次选择固化为规则)
```

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 组织表 + Token 鉴权 + PostgresSaver | ✅ |
| M1 | 澄清问答 + 组织偏好写回 | ✅ |
| M2 | 决策/遥测/权重 + 反馈 API + memory-sources | ✅ |
| M3 | episodes + 周报整固 + 注入 supervisor + MemoryTab UI | ✅ |
| M4 | function_pattern / validation_lesson 抽取 + episode Qdrant hybrid 检索 | 🟡 规划中 |

## 知识库状态机

```
POST /api/knowledge/docs (201 立即返回)
    ▼
uploading → chunking → embedding → graph_extracting → ready
any_stage → error (可点 ↻ 重试: 从 MinIO 重读原文件, 无需重传)
```

- 原始字节存 MinIO；文本提取统一走 `core/extractors.py`（PDF=PyMuPDF / DOCX=python-docx / HTML=BS4 / MD/TXT 直读）
- URL 通道：`POST /api/knowledge/urls`（httpx 单页抓取，800MB 上限，不跟链）
- 进度推送：`WS /ws/knowledge/docs/{id}`
- **跨部署 bundle**：`scripts/backup_knowledge.{sh,ps1}` / `restore_knowledge.{sh,ps1}`，manifest 校验 embed model/dim

## 部署架构 (Docker)

```
浏览器 :8090 → nginx (frontend 容器)
                 ├── 静态文件 (React SPA, try_files 回退)
                 ├── /api/* → backend:8000 (600s 超时, 800MB 上传, SSE 禁缓冲)
                 └── /ws/*  → backend:8000 (3600s)
backend :8001  ├── 启动自动 alembic upgrade head
               ├── PostgreSQL (业务 + 知识图谱 + langgraph checkpoints)
               ├── Qdrant (向量)   └── MinIO (原文档)
全部 5 服务带 healthcheck，backend 等 postgres/qdrant/minio 健康后才启动
```

## 选型规则引擎 (`core/rule_engine.py`)

1. `check_breaker_rating` — 断路器额定电流 ≥ 总负载 × 1.25
2. `check_sil_redundancy` — SIL2+ 要求冗余安全继电器
3. `check_protocol_compatibility` — 柜内设备协议统一 (PROFINET/PROFIBUS/EtherCAT)
4. `check_voltage_matching` — 线圈电压匹配控制电压
5. `check_motor_starter_match` — 电机功率 ≤ 接触器/热继电器额定值

## 前端设计系统

**B/C 融合风格**：Linear/Notion 干净感 + VS Code/GitHub 工程工具气质

- **主题**：MUI 6 MD3 主题 (`theme/md3.ts`)，light / dark / engineering 三档，Zustand 持久化
- **字体**：Inter (UI) + JetBrains Mono (代码)
- **布局**：三栏（ConversationSidebar / Canvas 画布 / ChatPanel），侧栏可拖拽，键盘快捷键 (? 键呼出帮助)
- **代码面板**：Monaco，展示 EPlan XML（v2）/ ST（v1 遗留）
- **导出**：`ReportExporter` 一键 ZIP（BOM xlsx + 接线表 + EPlan XML + 拓扑 JSON + 调试手册）

## 数据库与迁移

**20 张业务表**：projects, requirements, io_items, logic_rules, bom_items, schematics, **schematic_pages**, st_modules, project_topologies, knowledge_docs, component_nodes, component_edges, chat_messages, organizations, org_preferences, decisions, run_history, selection_weights, episodic_memories, weekly_memory_reports（另 `alembic_version` + `langgraph_checkpoints*` 由工具管理）

- 迁移链单头：`001 → a4d5b3e39d74 → 002 → 003 → 002_langgraph_checkpoint → 003_chat_messages → 004 → 005 → 006 → 007 → 008 → 009 → 010_project_topologies → 011_schematic_pages`
- FK 策略：`component_*.source_doc_id` **ON DELETE SET NULL**（删文档保留图数据）；`org_preferences.org_id` CASCADE
- 002/005/009 迁移带方言守卫：PG 专属 DO 块/约束改写/trgm 索引在 SQLite 下自动跳过，迁移链在两种方言均可跑通
- **防漂移测试**：`tests/test_alembic_schema_sync.py` 在一次性 SQLite 上跑 `alembic upgrade head` 后与 `Base.metadata` 比对表/列
- 迁移：`cd backend && PYTHONPATH=. alembic upgrade head`（容器内自动执行；schema 变更必须走迁移，禁止只依赖 `create_all`）

## 开发约定

- **TDD**：先写测试后写实现（pytest + pytest-asyncio + aiosqlite）
- **MVS**：前端 Model (Zustand+types) / View (React 组件) / Service (API 客户端) 分离
- **LLM 调用**：统一走 `llm_service.chat(system, user)`，不直接调厂商 SDK
- **API 模式**：REST 统一 `/api/` 前缀，WebSocket `/ws/` 前缀
- **环境变量**：`.env` 配 API key，不硬编码（`.env.example` 含全部键说明）
- **Graphify**：`graphify-out/` 是本地生成物（已 gitignore）；本机需要先 `pip install graphify`，代码修改后 `python -m graphify update .` 更新知识图谱；架构问题先读 `graphify-out/GRAPH_REPORT.md`
- **健康检查**：docker-compose 各服务带 healthcheck，改 compose 时保持就绪依赖链

## API 端点一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查（含 DB 探测） |
| GET | `/api/llm-providers` | 厂商注册表（前端下拉/自动回填的单一真相源） |
| POST | `/api/test-connectivity` | Chat + Embedding 双组连通性测试 |
| GET | `/api/tasks` | 后台任务状态 |
| POST | `/api/debug/log` | 前端错误上报 |
| GET/POST | `/api/projects` | 项目列表/创建 |
| GET/DELETE | `/api/projects/{id}` | 详情/删除 |
| POST | `/api/projects/search` · GET `/api/projects/search?q=` | 项目文本搜索 |
| GET | `/api/projects/cluster` | 主题标签聚类（侧栏） |
| POST | `/api/projects/{id}/analyze` | v1 需求分析（串行，兼容保留） |
| POST | `/api/projects/{id}/analyze-v2` | ★ LangGraph 14 节点全流程（SSE） |
| POST | `/api/projects/{id}/chat` | 快速对话（免 graph，带答案质检） |
| POST | `/api/projects/{id}/resume` | 断点续跑 |
| POST | `/api/projects/{id}/select` | 选型（v2 已并入 graph） |
| POST | `/api/projects/{id}/schematic` | 原理图生成（v1 mermaid 框图） |
| POST/GET | `/api/projects/{id}/schematic/pages[/{no}]` | ★ 电路级原理图页派生/列表/单页（主回路/控制/IO，SVG） |
| POST | `/api/projects/{id}/codegen` | ★ EPlan XML 生成（确定性兜底 + LLM 校验择优） |
| POST | `/api/projects/{id}/clarify/answer` | 澄清答复写回 |
| GET/POST | `/api/projects/{id}/topology` | 拓扑快照读/存 |
| POST | `/api/projects/{id}/topology/confirm` | 确认拓扑 → 触发派生 |
| GET/POST | `/api/projects/{id}/messages` | 对话历史 |
| POST | `/api/projects/{id}/feedback/select` · `/edit` · `/negative` | M2 反馈捕获 → decisions |
| GET | `/api/projects/{id}/memory-sources` | 选型来源溯源 |
| GET/POST | `/api/knowledge/docs` | 知识库列表/上传（异步） |
| POST | `/api/knowledge/urls` | 单页 URL 抓取入库 |
| DELETE | `/api/knowledge/docs` · `/docs/{id}` | 批量/单个删除 |
| POST | `/api/knowledge/docs/{id}/retry` | 重试失败文档 |
| POST | `/api/knowledge/search` | 知识库搜索 |
| GET/POST | `/api/knowledge/graph/nodes` | 元件图节点 |
| GET/POST | `/api/knowledge/graph/edges` | 元件图关系 |
| POST | `/api/search` | ★ 统一搜索（向量+词法 RRF：knowledge/components/projects） |
| POST | `/api/orgs` · GET `/api/orgs/me` | 创建/当前组织 |
| GET/PUT/DELETE | `/api/orgs/me/preferences[/{key}]` | 组织偏好 |
| GET | `/api/orgs/me/episodes` | 当前 org 的 episodic memory |
| GET | `/api/orgs/me/memory-reports` | 记忆周报 |
| POST | `/api/admin/consolidate-memory` | M3 整固（consolidate-now） |
| POST | `/api/admin/memory/reports/{id}/apply` | 应用周报规则 |
| WS | `/ws/projects/{id}` | 分析实时进度 |
| WS | `/ws/knowledge/docs/{id}` | 知识库文档处理进度 |

## 测试

- **后端** 44 个测试文件：unit / api (SQLite+内联 app) / 记忆飞轮 / 生成器 / **电路原理图 (IR/主回路/控制/IO/SVG+API)** / 幂等 / 迁移一致性；`cd backend && PYTHONPATH=. python -m pytest tests/ -q`
- **前端** Vitest + Testing Library：组件 + 服务同名 `.test.ts`；`cd frontend && npm ci && npm run test && npm run build`（build 含 `tsc` 类型检查）
- **CI**：`.github/workflows/ci.yml` — backend pytest (sqlite) + frontend npm ci/test/build，push/PR 触发
- **Docker 全量**：`docker compose up -d --build` 后 `docker exec ele-backend-1 python -m pytest tests -q`

## graphify（开发用知识图谱）

`graphify-out/`（graph.json + GRAPH_REPORT.md + graph.html）由 graphify 生成，本地生成物不入库。当前机器需先 `pip install graphify`，然后：

```bash
python -m graphify update .    # AST 增量更新（不用 npm graphify）
```

- 架构问题先读 `graphify-out/GRAPH_REPORT.md` 了解 god node 与社区结构
- 跨模块关系优先用 `graphify query/path/explain` 代替 grep
- 修改代码后运行 `graphify update .` 保持图谱最新（AST-only，免费）
