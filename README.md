# Volta — 电气工程师助手 (LangGraph Multi-Agent)

面向工业自动化领域的电气工程设计辅助工具。自然语言输入 → 需求拆解 → 元器件选型 → 原理图生成 → PLC ST 代码输出。

## 核心功能

| 模块 | 说明 |
|------|------|
| **需求分析** | 自然语言输入 → LangGraph 9-Agent DAG → 结构化需求（I/O清单、控制逻辑、安全等级） |
| **元器件选型** | RAG 双路检索（Qdrant 语义 + 知识图谱 BFS）+ 规则引擎校验（5条硬约束） |
| **原理图生成** | 基于选型BOM自动生成 Mermaid 框图，可导出 SVG |
| **ST 代码生成** | 西门子 S7-1200/1500 TIA Portal 格式，安全逻辑完整实现 |
| **知识库管理** | PDF 上传, 6阶段异步处理, WS实时进度, 批量删除, 失败重试(MinIO) |
| **LLM 连通性测试** | 设置面板一键测试 Chat + Embedding 两组 API 连通性 |

## 架构

```
浏览器 :80 → nginx ──────────────────────→ 静态文件 (React SPA)
                 │
                 ├── /api/* → FastAPI:8000
                 │     ├── LangGraph 9-Agent DAG
                 │     ├── Qdrant 向量检索 + PG 知识图谱 BFS
                 │     ├── 规则引擎 (5条硬约束)
                 │     └── LLM 调用 (Chat + Embedding 双组独立)
                 │
                 └── /ws/* → WebSocket (分析进度 + 知识库处理进度)

数据层: PostgreSQL 16 · Qdrant · MinIO (PDF存储)
```

## 技术栈

| 层 | 选型 |
|---|------|
| 前端 | React 18 · TypeScript · Tailwind CSS 3 · Zustand · Monaco Editor · Mermaid |
| 后端 | FastAPI · WebSocket · SQLAlchemy 2 (async) · Pydantic v2 |
| LLM | OpenAI-compatible (DeepSeek / Claude / GPT 均可) + 前端可配 Chat & Embedding 两组 API |
| Agent | LangGraph StateGraph + MemorySaver (9 节点, 3 路 fan-out) |
| 检索 | Qdrant 向量搜索 + PostgreSQL 知识图谱 BFS 双路 |
| 存储 | PostgreSQL 16 · Qdrant · MinIO (S3) |
| 部署 | Docker Compose 5 服务 (nginx/frontend/backend/postgres/qdrant/minio) |

## 快速开始

### 全 Docker 一键部署

```bash
docker compose up -d --build
docker exec ele-backend-1 alembic upgrade head
# → http://localhost
```

### 本地开发

```bash
docker compose up -d postgres qdrant minio
cd backend && pip install -r requirements.txt && PYTHONPATH=. alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload   # → :8000
cd frontend && npm install && npm run dev                    # → :5173
```

### 配置

打开前端 → 右上角齿轮 → 填入 Chat 和 Embedding 两组 API Key/Base URL/Model → 点 ⚡ 测试 → 保存

### 测试

```bash
cd backend && python -m pytest tests/ -v
cd frontend && npx tsc --noEmit && npx vite build
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/test-connectivity` | Chat + Embedding 连通性测试 |
| GET/POST | `/api/projects` | 项目列表/创建 |
| GET/DELETE | `/api/projects/{id}` | 项目详情/删除 |
| POST | `/api/projects/{id}/analyze` | v1 需求分析 (串行) |
| POST | `/api/projects/{id}/analyze-v2` | v2 LangGraph 全流程 |
| POST | `/api/projects/{id}/schematic` | 原理图生成 |
| POST | `/api/projects/{id}/codegen` | ST 代码生成 |
| GET/POST | `/api/knowledge/docs` | 知识库列表/上传 |
| DELETE | `/api/knowledge/docs` | 批量删除 |
| POST | `/api/knowledge/docs/{id}/retry` | 重试失败文档 |
| POST | `/api/knowledge/search` | 知识库搜索 |
| WS | `/ws/projects/{id}` | 分析进度推送 |
| WS | `/ws/knowledge/docs/{id}` | 文档处理进度推送 |

## 项目结构

```
ele/
├── backend/app/
│   ├── main.py                 # FastAPI 入口, lifespan, CORS, WS
│   ├── config.py               # 配置 (Chat/Embedding 双组)
│   ├── api/                    # REST 端点
│   │   ├── projects.py         #   项目 CRUD
│   │   ├── analysis.py         #   /analyze + /analyze-v2
│   │   ├── knowledge.py        #   知识库: 上传/批量删除/重试/WS
│   │   ├── selection.py        #   选型 (v1)
│   │   ├── schematic.py        #   原理图
│   │   └── codegen.py          #   ST 代码
│   ├── core/
│   │   ├── graph/              # LangGraph 9-Agent DAG
│   │   ├── llm_service.py      # LLM 封装 (JSON容错+重试)
│   │   ├── rag_engine.py       # Qdrant 向量检索 + 双路
│   │   ├── knowledge_graph.py  # 元件知识图谱
│   │   ├── rule_engine.py      # 5条硬约束校验
│   │   └── orchestrator.py     # WS管理 + graph启动
│   └── db/                     # ORM 模型 (11表) + 仓库
├── frontend/src/
│   ├── models/store.ts         # Zustand 全局状态
│   ├── services/api.ts         # API 客户端 + WS
│   ├── services/i18n.ts        # 中英文国际化
│   └── views/components/       # UI 组件
│       ├── AppLayout.tsx       # 主布局 (可拖拽分栏)
│       ├── ChatPanel.tsx       # 对话框 (SSE/JSON双模式)
│       ├── KnowledgePanel.tsx  # 知识库 (状态徽章/选择模式/重试)
│       ├── SettingsModal.tsx   # 设置 (连通性测试)
│       ├── CanvasPanel.tsx     # 画布容器
│       ├── BOMTable.tsx        # BOM 表
│       └── STCodeView.tsx      # Monaco 代码编辑器
├── docker-compose.yml          # 5服务编排
└── docs/                       # 设计文档
```
