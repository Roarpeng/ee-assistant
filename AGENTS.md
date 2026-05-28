# EE Assistant — 电气工程师助手 (LangGraph Multi-Agent Edition)

面向工业自动化领域的电气工程设计辅助工具。自然语言输入 → 需求拆解 → 元器件选型 → 原理图生成 → PLC ST 代码输出。

## 快速开始

```bash
# 全 Docker 一键部署（推荐）
docker compose up -d --build

# 数据库迁移
docker exec ele-backend-1 alembic upgrade head

# → 前端 http://localhost
# → 后端 http://localhost:8000
# → API 文档 http://localhost:8000/docs
```

```bash
# 本地开发模式（不使用 Docker）
docker compose up -d postgres qdrant minio
cd backend && pip install -r requirements.txt && PYTHONPATH=. alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
cd frontend && npm install && npm run dev   # → http://localhost:5173
```

```bash
# 测试
cd backend && python -m pytest tests/ -v
cd frontend && npx tsc --noEmit && npx vite build
```

## 技术栈

| 层 | 选型 |
|---|------|
| 前端 | React 18 · TypeScript · Tailwind CSS 3 · Zustand · Monaco Editor · Mermaid |
| 后端 | FastAPI · WebSocket · SQLAlchemy 2 (async) · Pydantic v2 |
| LLM | OpenAI-compatible (DeepSeek / Codex / GPT 均可) + 前端可配 Chat & Embedding 两组 API |
| Agent 编排 | **LangGraph** StateGraph + MemorySaver (9 节点有状态 DAG, 3 路 fan-out) |
| 知识库 | Qdrant (向量搜索) + **PostgreSQL 图表** (元件关系图) |
| 图算法 | NetworkX · python-louvain (社区检测) |
| 存储 | PostgreSQL 16 · Qdrant · MinIO (S3) |
| 部署 | Docker Compose |

## 项目结构

```
ele/
├── backend/app/
│   ├── main.py                    # FastAPI 入口, lifespan(建表+Qdrant集合), CORS, WS端点
│   │   │                          #   /api/health, /api/test-connectivity (连通性测试)
│   ├── config.py                  # Pydantic Settings (Chat/Embedding 双组 LLM 配置)
│   ├── api/                       # REST + WebSocket 端点
│   │   ├── projects.py            #   CRUD: 创建/列表/详情/删除项目 (selectinload)
│   │   ├── analysis.py            #   POST /{id}/analyze (v1) + /analyze-v2 (LangGraph)
│   │   ├── selection.py           #   选型推荐 (v1 独立端点, v2 已合并入 graph)
│   │   ├── schematic.py           #   原理图生成
│   │   ├── codegen.py             #   ST 代码生成
│   │   └── knowledge.py           #   知识库: 异步上传+阶段推送+批量删除+重试+MinIO存储
│   ├── core/                      # 核心引擎
│   │   ├── graph/                 #   ★ LangGraph 多 Agent 系统 ★
│   │   │   ├── state.py           #     AnalysisState (Annotated reducers for fan-out)
│   │   │   ├── agents.py          #     9 个 Agent 节点 (RAG 搜索 fault-tolerant, ★拓扑生成+自动连线★)
│   │   │   └── builder.py         #     StateGraph 构建 + compile(MemorySaver)
│   │   ├── orchestrator.py        #   WS 管理 + graph 启动 + rag_engine 配置传递
│   │   ├── llm_service.py         #   OpenAI-compatible 封装, JSON 容错+重试+RateLimit backoff
│   │   ├── rag_engine.py          #   Qdrant 向量索引 + 双路检索, min_score 过滤
│   │   ├── task_tracker.py        #   ★ 后台任务注册表 (运行/完成/失败跟踪)
│   │   ├── logging_config.py      #   ★ 结构化日志配置 (替换 print)
│   │   ├── knowledge_graph.py     #   ★ 元件知识图 CRUD + BFS 遍历 ★
│   │   ├── entity_extractor.py    #   LLM 从 PDF 提取电气元件实体 + 关系
│   │   ├── community_detector.py  #   NetworkX Louvain 社区检测
│   │   ├── rule_engine.py         #   5 条硬约束选型校验规则
│   │   ├── component_taxonomy.py  #   ★ 元器件类型+协议规范集合 (KG/拓扑双体系)
│   │   ├── component_normalizer.py #  ★ 类型/协议归一化 (KG canonical + topology-native 双通道)
│   │   ├── topology_lint.py       #   拓扑图有效性校验 (节点ID/悬空边/电源链路)
│   │   └── schemas.py             #   Pydantic 数据模型 (BatchDeleteInput, ConnectivityTestInput 等)
│   └── db/
│       ├── models.py              #   11 个 ORM 模型 (KnowledgeDoc.status, FK ondelete SET NULL)
│       └── repository.py          #   AsyncEngine + 连接池配置 (pool_size/pre_ping/recycle)
├── frontend/
│   ├── nginx.conf                 #   nginx 反向代理 (300s API超时, 100MB上传, WS代理)
│   └── src/
│       ├── hooks/                 # 自定义 React Hooks
│       │   ├── useDebounce.ts     #   搜索防抖 (延迟触发)
│       │   └── useReconnectingWS.ts #   WebSocket 自动重连 (指数退避) + sessionStorage 缓存
│       ├── models/                # M: 类型定义 + Zustand store (KnowledgeDoc, 选择模式, Toast)
│       ├── views/components/      # V: UI 组件
│       │   ├── AppLayout.tsx      #   主布局: 可拖拽分栏 + 主题 + 标签切换 + 键盘快捷键
│       │   ├── ChatPanel.tsx      #   对话框 (SSE/JSON 双模式, 心跳监测, HTTP 错误处理)
│       │   ├── CanvasPanel.tsx    #   右侧画布容器 (VS Code 风格标签栏)
│       │   ├── FrameworkDiagram.tsx #   Mermaid 框图渲染
│       │   ├── BOMTable.tsx       #   选型 BOM 表 (置信度彩色标签, 搜索防抖, 骨架屏)
│       │   ├── STCodeView.tsx     #   Monaco Editor ST 代码
│       │   ├── KnowledgePanel.tsx #   知识库: 状态徽章(6色), 选择模式, 批量删除确认, WS进度+重连, 搜索防抖, 骨架屏
│       │   ├── ConversationSidebar.tsx # 会话列表: 搜索防抖, 删除确认对话框
│       │   ├── SettingsModal.tsx  #   设置: Chat+Embedding 双组配置, 连通性测试, 输入校验
│       │   ├── ErrorBoundary.tsx  #   ★ React 错误边界 + 降级 UI
│       │   ├── GlobalToast.tsx    #   ★ 全局 API 错误 Toast (自动消失)
│       │   ├── ConfirmDialog.tsx  #   ★ 可复用确认对话框 (severity 色彩)
│       │   ├── KeyboardShortcuts.tsx # ★ 键盘快捷键帮助 (? 键触发)
│       │   ├── TopologyPanel.tsx  #   ★ 拓扑画布: ReactFlow + Yjs CRDT, 21种节点类型, 5层重力对齐
│       │   ├── CustomNodes.tsx    #   ★ 拓扑节点组件: PLC/HMI/IO/VFD/SafetyDoor/SignalLight等
│       │   ├── NodeInfoCard.tsx   #   拓扑节点信息卡片
│       │   ├── CanvasContextMenu.tsx # 画布右键菜单
│       │   ├── IOBudgetBar.tsx    #   IO 预算进度条
│       │   └── ProgressStepper.tsx #   流程步骤指示器
│       └── services/              # S: API 客户端 (batch delete, retry, connectivity test)
├── docker-compose.yml             # 5 服务: frontend/backend/postgres/qdrant/minio
├── docs/superpowers/              # 设计文档 + 实现计划
└── graphify-out/                  # 知识图谱 (graph.json + GRAPH_REPORT.md + graph.html)
```

## LangGraph 多 Agent 拓扑

9 个 Agent 节点, 3 路 fan-out, 状态持久化:

```
START → RequirementsAgent (自然语言→结构化需求)
           │
     ┌─────┼─────┐
     ▼     ▼     ▼
  Category  Safety  Constraint
  Mapper  Assessor  Extractor
     │     │     │
     └─────┼─────┘
           ▼
  SelectionSupervisor ←── 双路检索: Qdrant 语义 + 图 BFS 遍历
           │
           ▼
     RuleValidator (5 条硬约束)
           │
     ┌─────┼─────┐
     ▼     ▼     ▼
  Schematic  Code    Final
  Generator  Gen   Review
     │     │     │
     └─────┼─────┘
           ▼
          END
```

**关键特性:**
- 状态通过 `AnalysisState` TypedDict 在所有节点间流转
- MemorySaver 持久化状态, 支持断点续跑 (thread_id = project_id)
- SelectionSupervisor 执行双路检索: Qdrant 语义搜索 + 图邻居 BFS 遍历
- 新旧端点共存: `/analyze` (v1 串行) 和 `/analyze-v2` (LangGraph DAG)

## 拓扑图生成管线 (Topology Generation Pipeline)

LLM 驱动的 5 层工业拓扑图自动生成, 支持自动连线 + 回退兜底:

```
BOM + 需求 → LLM generate_topology_json() → _normalize_topology() → 自动连线器 → lint 校验
                          ↓ (失败时)
                    _build_fallback_topology() (规则兜底)
```

**5 层工业层级:** L0 Power → L1 Protection → L2 Control → L3 Execution → L4 Feedback
**双类型体系:** KG 体系 (plc_cpu/io_module) vs 拓扑体系 (plc/io) — `component_normalizer.py` 提供双通道归一化
**自动连线规则:** 按类型匹配连接 (estop→safety_relay, safety_door→safety_plc, plc→signal_light 等)
**前端渲染:** ReactFlow + Yjs CRDT 协同编辑, 21 种自定义节点组件, 5 层自动重力对齐

## 元件知识图谱 (Component Knowledge Graph)

在 PostgreSQL 中建模电气元件及其关系:

```
component_nodes:  id | name | component_type | properties(JSONB) | community | source_doc_id
component_edges:  id | source_id → target_id | relation | properties(JSONB) | confidence
```

**7 种电气关系:** `REQUIRES_POWER` | `OUTPUTS_SIGNAL` | `USES_PROTOCOL` | `COMPATIBLE_WITH` | `ALTERNATIVE_TO` | `MOUNTS_ON` | `CONTROLS`

**工作流:**
1. PDF 上传 → PyMuPDF 提取文本
2. 向量路径 (现有): chunk → embedding → Qdrant
3. 图路径 (新增): LLM 实体提取 → LLM 关系提取 → upsert 到 PG → Louvain 社区检测
4. 选型时: Qdrant 语义 + 图 BFS 双路检索, 结果合并去重

## 知识库 Bundle (跨部署共享)

知识库建立成本高 (embedding API + LLM 实体抽取费用), 用 bundle 脚本一次打包多端复用:

```bash
./scripts/backup_knowledge.sh                           # → bundles/knowledge-bundle-*.tgz
./scripts/restore_knowledge.sh <bundle.tgz>             # 目标端: 还原 4 张知识表 + Qdrant + MinIO PDF
# Windows: scripts/backup_knowledge.ps1 / restore_knowledge.ps1
```

Bundle = Qdrant snapshot + `pg_dump` (knowledge_docs/component_nodes/component_edges/alembic_version) + MinIO bucket. 含 `manifest.json` 校验 embed model/dim, 不匹配中止保护用户. 详见 `docs/knowledge-bundle.md`.

## 知识库状态机

文档处理异步流转, WebSocket 实时推送:

```
POST /api/knowledge/docs (201 立即返回)
    │
    ▼
uploading → chunking → embedding → graph_extracting → ready
any_stage → error (异常时, 可点 ↻ 重试)
```

- 原始字节(PDF/TXT/MD/HTML/DOCX/URL 抓取页)存储到 MinIO, 失败后可重试无需重新上传
- 文本提取统一走 `core/extractors.py` 调度,按文件后缀+MIME 双重匹配
- URL 通道: `POST /api/knowledge/urls` 单页抓取(httpx, 800MB 上限, 不跟链),`source_type='url'`
- 重试: `POST /api/knowledge/docs/{id}/retry`(从 MinIO 重读, 重新走 dispatch)
- 进度推送: `WS /ws/knowledge/docs/{id}`

## 部署架构 (Docker)

```
浏览器 :80 → nginx (frontend) ──────────────→ 静态文件
                    │
                    ├── /api/* → backend:8000 (FastAPI)
                    │               ├── LLM 调用 (Chat + Embedding 双组配置)
                    │               ├── PostgreSQL (知识图谱 + 业务数据)
                    │               ├── Qdrant (向量检索)
                    │               └── MinIO (PDF 存储)
                    │
                    └── /ws/*  → backend:8000 (WebSocket)
```

nginx 配置: API 超时 300s, 上传限制 100MB, WS 超时 3600s.

## 选型规则引擎

5 条硬约束 (文件: `core/rule_engine.py`):
1. `check_breaker_rating` — 断路器额定电流 ≥ 总负载 × 1.25
2. `check_sil_redundancy` — SIL2+ 要求冗余安全继电器
3. `check_protocol_compatibility` — 柜内设备协议统一 (PROFINET/PROFIBUS)
4. `check_voltage_matching` — 线圈电压匹配控制电压
5. `check_motor_starter_match` — 电机功率 ≤ 接触器/热继电器额定值

## 前端设计系统

**B/C 融合风格:** Linear/Notion 干净感 + VS Code/GitHub 工程工具气质

- **主题:** CSS 变量驱动, `data-theme="light|dark"`, localStorage 持久化
- **字体:** Inter (UI) + JetBrains Mono (代码)
- **令牌前缀:** `app-` → `bg-app-bg-primary`, `text-app-text-secondary`, `rounded-app-md`, `shadow-app-sm`
- **分栏:** 左侧 20%-50% 可拖拽, 中间 1px 分隔线 hover 高亮
- **组件:** ThemeToggle 在标签栏右上角, CanvasPanel 使用 VS Code 风格底部 accent 标签

## 数据库

11 个表: `projects`, `requirements`, `io_items`, `logic_rules`, `bom_items`, `schematics`, `st_modules`, `knowledge_docs`(含 `status`, `error_message`), `component_nodes`, `component_edges`, `alembic_version`

FK 级联: `component_nodes.source_doc_id` / `component_edges.source_doc_id` → `ON DELETE SET NULL` (删文档时图数据保留)

迁移: `cd backend && PYTHONPATH=. alembic upgrade head` (或 `docker exec ele-backend-1 alembic upgrade head`)

## 开发约定

- **TDD:** 先写测试, 后写实现 (pytest + asyncio)
- **MVS:** 前端分离 Model (Zustand + types) / View (React 组件) / Service (API 调用)
- **Graphify:** 代码修改后运行 `graphify update .` 更新知识图谱 (AST-only, 免费)
- **架构问题:** 先读 `graphify-out/GRAPH_REPORT.md` 了解 god node 和社区结构
- **跨模块问题:** 优先用 `graphify query` / `graphify path` / `graphify explain` 代替 grep
- **API 模式:** 所有端点统一 `/api/` 前缀, WebSocket `/ws/` 前缀
- **LLM 调用:** 通过 `llm_service.chat(system, user)` 统一入口, 不直接调 Anthropic SDK
- **环境变量:** `.env` 文件配置 API key, 不硬编码

## API 端点一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/test-connectivity` | **LLM 连通性测试** (Chat + Embedding) |
| GET/POST | `/api/projects` | 列表/创建项目 |
| GET/DELETE | `/api/projects/{id}` | 详情/删除项目 |
| POST | `/api/projects/{id}/analyze` | v1 需求分析 (串行) |
| POST | `/api/projects/{id}/analyze-v2` | ★ v2 LangGraph 全流程 |
| POST | `/api/projects/{id}/schematic` | 原理图生成 |
| POST | `/api/projects/{id}/codegen` | ST 代码生成 |
| GET/POST | `/api/knowledge/docs` | 知识库列表/上传 (PDF/TXT/MD/HTML/DOCX,异步+阶段推送) |
| POST | `/api/knowledge/urls` | **★ 单页 URL 抓取入库** `{url, manufacturer?, ...}` |
| DELETE | `/api/knowledge/docs` | **批量删除** `{ids: [...]}` |
| DELETE | `/api/knowledge/docs/{id}` | 删除单个文档 |
| POST | `/api/knowledge/docs/{id}/retry` | **重试失败文档** |
| POST | `/api/knowledge/search` | 知识库搜索 |
| GET | `/api/tasks` | 后台任务状态 (运行中/最近完成/失败) |
| WS | `/ws/projects/{id}` | 项目分析实时进度 |
| WS | `/ws/knowledge/docs/{id}` | **知识库文档处理进度** |

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
| POST | `/api/projects/{id}/analyze-v2` | ★ v2 LangGraph 全流程 |
| POST | `/api/projects/{id}/schematic` | 原理图生成 |
| POST | `/api/projects/{id}/codegen` | ST 代码生成 |
| GET/POST | `/api/knowledge/docs` | 知识库列表/上传 (PDF/TXT/MD/HTML/DOCX,异步+阶段推送) |
| POST | `/api/knowledge/urls` | **★ 单页 URL 抓取入库** `{url, manufacturer?, ...}` |
| DELETE | `/api/knowledge/docs` | **批量删除** `{ids: [...]}` |
| DELETE | `/api/knowledge/docs/{id}` | 删除单个文档 |
| POST | `/api/knowledge/docs/{id}/retry` | **重试失败文档** |
| POST | `/api/knowledge/search` | 知识库搜索 |
| GET | `/api/tasks` | 后台任务状态 (运行中/最近完成/失败) |
| WS | `/ws/projects/{id}` | 项目分析实时进度 |
| WS | `/ws/knowledge/docs/{id}` | **知识库文档处理进度** |

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
