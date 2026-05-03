# EE Assistant — 电气工程师助手 (LangGraph Multi-Agent Edition)

面向工业自动化领域的电气工程设计辅助工具。自然语言输入 → 需求拆解 → 元器件选型 → 原理图生成 → PLC ST 代码输出。

## 快速开始

```bash
# 基础设施
docker compose up -d postgres qdrant minio

# 后端
cd backend
pip install -r requirements.txt
PYTHONPATH=. alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 前端
cd frontend
npm install
npm run dev          # → http://localhost:5173
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
| LLM | Anthropic Claude (可替换) · OpenAI Embeddings (text-embedding-3-small) |
| Agent 编排 | **LangGraph** StateGraph + MemorySaver (9 节点有状态 DAG) |
| 知识库 | Qdrant (向量搜索) + **PostgreSQL 图表** (元件关系图) |
| 图算法 | NetworkX · python-louvain (社区检测) |
| 存储 | PostgreSQL 16 · Qdrant · MinIO (S3) |
| 部署 | Docker Compose |

## 项目结构

```
ele/
├── backend/app/
│   ├── main.py                    # FastAPI 入口, lifespan 建表, CORS, WebSocket
│   ├── config.py                  # Pydantic Settings (DB/Qdrant/MinIO/LLM keys)
│   ├── api/                       # REST + WebSocket 端点
│   │   ├── projects.py            #   CRUD: 创建/列表/详情/删除项目
│   │   ├── analysis.py            #   POST /{id}/analyze (v1 原始) + /analyze-v2 (LangGraph)
│   │   ├── selection.py           #   选型推荐 (v1 独立端点, v2 已合并入 graph)
│   │   ├── schematic.py           #   原理图生成
│   │   ├── codegen.py             #   ST 代码生成
│   │   └── knowledge.py           #   知识库上传/列表/删除/搜索 + 图提取后台任务
│   ├── core/                      # 核心引擎
│   │   ├── graph/                 #   ★ LangGraph 多 Agent 系统 ★
│   │   │   ├── state.py           #     AnalysisState TypedDict (13 字段)
│   │   │   ├── agents.py          #     9 个 Agent 节点函数
│   │   │   └── builder.py         #     StateGraph 构建 + compile(MemorySaver)
│   │   ├── orchestrator.py        #   WebSocket 管理 + graph 启动 (新旧双模式)
│   │   ├── llm_service.py         #   Anthropic Claude 封装 (5 个领域方法)
│   │   ├── rag_engine.py          #   Qdrant 向量索引 + 双路检索 (Qdrant+Graph)
│   │   ├── knowledge_graph.py     #   ★ 元件知识图 CRUD + BFS 遍历 ★
│   │   ├── entity_extractor.py    #   LLM 从 PDF 提取电气元件实体 + 关系
│   │   ├── community_detector.py  #   NetworkX Louvain 社区检测
│   │   ├── rule_engine.py         #   5 条硬约束选型校验规则
│   │   └── schemas.py             #   Pydantic 数据模型 (共享前端 JSON Schema)
│   └── db/
│       ├── models.py              #   11 个 ORM 模型 (含 ComponentNode/ComponentEdge)
│       └── repository.py          #   AsyncEngine + session factory
├── frontend/src/
│   ├── models/                    # M: 类型定义 + Zustand store (含 theme 状态)
│   ├── views/components/          # V: 18 个 UI 组件
│   │   ├── AppLayout.tsx          #   主布局: 可拖拽分栏 + 主题 + 标签切换
│   │   ├── ThemeToggle.tsx        #   浅色/暗色切换按钮
│   │   ├── ChatPanel.tsx          #   左侧对话框 (消息流 + 输入)
│   │   ├── CanvasPanel.tsx        #   右侧画布容器 (VS Code 风格标签栏)
│   │   ├── FrameworkDiagram.tsx   #   Mermaid 框图渲染
│   │   ├── BOMTable.tsx           #   选型 BOM 表 (置信度彩色标签)
│   │   ├── STCodeView.tsx         #   Monaco Editor ST 代码
│   │   ├── KnowledgePanel.tsx     #   知识库管理 (卡片网格)
│   │   └── ProgressStepper.tsx    #   流程步骤指示器
│   └── services/                  # S: API 客户端 + WebSocket + 导出
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

11 个表: `projects`, `requirements`, `io_items`, `logic_rules`, `bom_items`, `schematics`, `st_modules`, `knowledge_docs`, `component_nodes`, `component_edges`, `alembic_version`

迁移: `cd backend && PYTHONPATH=. alembic upgrade head`

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
| GET/POST | `/api/projects` | 列表/创建项目 |
| GET/DELETE | `/api/projects/{id}` | 详情/删除项目 |
| POST | `/api/projects/{id}/analyze` | v1 需求分析 (串行) |
| POST | `/api/projects/{id}/analyze-v2` | ★ v2 LangGraph 全流程 |
| POST | `/api/projects/{id}/select` | v1 选型 (独立) |
| POST | `/api/projects/{id}/schematic` | 原理图生成 |
| POST | `/api/projects/{id}/codegen` | ST 代码生成 |
| GET/POST/DELETE | `/api/knowledge/docs` | 知识库管理 |
| POST | `/api/knowledge/search` | 知识库搜索 |
| WS | `/ws/projects/{id}` | 实时进度推送 |

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
