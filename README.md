# Volta

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/Roarpeng/ee-assistant?style=social)](https://github.com/Roarpeng/ee-assistant/stargazers)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Node.js 18+](https://img.shields.io/badge/node.js-18+-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-supported-blue.svg)](https://www.docker.com/)
[![CI](https://github.com/Roarpeng/ee-assistant/workflows/CI/badge.svg)](https://github.com/Roarpeng/ee-assistant/actions)

**Topology-first electrical engineering AI** — from natural language to confirmed topology, BOM, schematics, and PLC ST code.

Volta（伏特）是面向工业自动化的电气工程设计工作台：以**可编辑拓扑为单一真相源**，LangGraph 多智能体负责需求拆解、双路 RAG 选型、规则校验与派生产物生成。

[English](#english) · [中文](#中文) · [5-minute demo](docs/DEMO.md)

---

## 中文

### 为什么选择 Volta

| 能力 | 说明 |
|------|------|
| **拓扑真相源** | ReactFlow 画布可编辑；BOM / 接线 / ST / 导出均派生自已确认拓扑 |
| **LangGraph 工程流水线** | 12 节点 DAG：需求 → 并行分析 → 选型监督 → 规则校验 → 原理图 / 代码 / 接线 / 调试 |
| **双路知识检索** | Qdrant 语义搜索 + PostgreSQL 元件图谱 BFS |
| **知识库可迁移** | `scripts/backup_knowledge.*` 打包向量库 + 图谱 + MinIO，一键还原 |
| **工程交付** | 概览页导出 ZIP（BOM xlsx、接线表、SCL、Mermaid、拓扑 JSON） |

### 5 分钟体验

1. `docker compose up -d --build` → 打开 http://localhost  
2. 右上角 **设置** → 配置 Chat + Embedding API → **测试连通性** → 保存  
3. 对话区点击 **完整工程生成**（或输入输送线/电机控制需求）  
4. 在 **拓扑图** 调整节点 → **概览** 导出工程包  

详见 [docs/DEMO.md](docs/DEMO.md)。

### 快速开始

```bash
# 全 Docker（推荐）
cp .env.example .env   # 可选：后端默认 LLM 兜底
docker compose up -d --build
docker exec ele-backend-1 alembic upgrade head
# → http://localhost  (compose 映射 8090 时见 docker-compose.yml)
```

```bash
# 本地开发
docker compose up -d postgres qdrant minio
cd backend && pip install -r requirements.txt && PYTHONPATH=. alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
cd frontend && npm install && npm run dev   # → http://localhost:5173
```

### 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 · TypeScript · MUI 6 · Zustand · ReactFlow · Monaco · Mermaid |
| 后端 | FastAPI · SQLAlchemy 2 (async) · Alembic |
| Agent | LangGraph · AsyncPostgresSaver |
| 检索 | Qdrant + PostgreSQL 元件图 · NetworkX / Louvain |
| 存储 | PostgreSQL 16 · Qdrant · MinIO |
| 部署 | Docker Compose（frontend / backend / postgres / qdrant / minio） |

### 测试

```bash
cd backend && PYTHONPATH=. python -m pytest tests/ -q
cd frontend && npm ci && npm run test && npm run build
```

CI：GitHub Actions（`.github/workflows/ci.yml`）。

### 文档

- [项目总览](docs/PROJECT_OVERVIEW.md) — 架构、API、记忆飞轮  
- [知识库 Bundle](docs/knowledge-bundle.md) — 跨环境迁移  
- [LLM 厂商建议](docs/llm-providers-and-industrial-recommendations.md)  

### 知识图谱（开发）

```bash
python -m graphify update .    # AST 增量更新 graphify-out/（勿用 npm graphify）
```

---

## English

### Why Volta

Volta is an open-source electrical design copilot for industrial automation. Unlike generic chat+BOM tools, it treats **editable topology as the source of truth** and runs a **LangGraph multi-agent pipeline** for requirements, selection, validation, and deliverables.

### Highlights

- **12-node LangGraph DAG** with Postgres checkpointing  
- **Hybrid RAG**: vector search (Qdrant) + component graph BFS (PostgreSQL)  
- **5 hard constraint rules** (breaker rating, SIL redundancy, protocol, voltage, motor starter)  
- **Knowledge bundle** scripts to share expensive embedding/graph corpora across deployments  
- **Export package**: ZIP with BOM, wiring, SCL, Mermaid, topology JSON  

### Quick start

```bash
cp .env.example .env
docker compose up -d --build
docker exec ele-backend-1 alembic upgrade head
```

Configure Chat + Embedding keys in the UI (Settings → connectivity test → Save), then click **Full engineering run** in the chat panel.

See [docs/DEMO.md](docs/DEMO.md) for a guided walkthrough.

### License

[MIT License](LICENSE) — Contributions welcome via [issues](https://github.com/Roarpeng/ee-assistant/issues) and [PRs](https://github.com/Roarpeng/ee-assistant/pulls). See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Support

- 📖 [Documentation](docs/)
- 💬 [GitHub Discussions](https://github.com/Roarpeng/ee-assistant/discussions)
- 🐛 [Bug Reports](https://github.com/Roarpeng/ee-assistant/issues/new?template=bug_report.md)
- 💡 [Feature Requests](https://github.com/Roarpeng/ee-assistant/issues/new?template=feature_request.md)
- 📧 [Security](mailto:security@volta.dev)

---

<p align="center"><strong>Volta</strong> — 电气工程智能设计平台 · Electrical Engineering AI Design Platform</p>
