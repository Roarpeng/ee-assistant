# EE Assistant — 电气工程师助手

面向工业自动化领域的电气工程设计辅助工具。通过自然语言或结构化表单描述控制需求，自动完成需求拆解、元器件选型推荐、电气原理框图生成、PLC ST 代码框架输出。

## 核心功能

| 模块 | 说明 |
|------|------|
| **需求分析** | 自然语言输入 → 结构化需求文档（I/O清单、控制逻辑、安全等级） |
| **元器件选型** | RAG知识库检索 + LLM推理 + 规则引擎校验（5条硬约束） → 分层置信度BOM表 |
| **原理图生成** | 基于选型BOM和控制逻辑自动生成 Mermaid 框图，可交互，可导出 SVG |
| **ST 代码生成** | 西门子 S7-1200/1500 TIA Portal 格式，安全逻辑完整实现，常规逻辑框架 |
| **知识库管理** | 上传管理厂商 PDF 手册，智能分块，语义检索，选型推荐可追溯原文 |
| **导出** | SVG 矢量图 / Excel BOM表 / PDF 报告 / 直接打印 |

## 技术栈

**前端：** React 18 + TypeScript + Tailwind CSS + Zustand · Monaco Editor · Mermaid  
**后端：** FastAPI + WebSocket · SQLAlchemy (async) · Anthropic Claude · OpenAI Embeddings  
**基础设施：** PostgreSQL 16 + Qdrant + MinIO · Docker Compose

## 项目结构

```
ele/
├── frontend/                 # React SPA (MVS 架构)
│   └── src/
│       ├── models/           # M: 数据模型 + Zustand 状态
│       ├── views/components/ # V: UI 组件
│       └── services/         # S: API + WebSocket + 导出
├── backend/                  # FastAPI 服务
│   └── app/
│       ├── api/              # REST + WebSocket 端点
│       ├── core/             # LLM · RAG · 规则引擎 · 编排器
│       └── db/               # ORM 模型 + 仓库
├── docker-compose.yml        # 一键部署
└── docs/superpowers/         # 设计文档 & 实现计划
```

## 快速开始

### 前置条件

- Docker Desktop
- Node.js 18+
- Python 3.12+

### 部署

```bash
# 1. 启动基础设施
docker compose up -d postgres qdrant minio

# 2. 初始化数据库
cd backend
pip install -r requirements.txt
PYTHONPATH=. alembic upgrade head

# 3. 启动后端
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 4. 启动前端（新终端）
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173

### 全 Docker 部署

```bash
export ANTHROPIC_API_KEY=your_key
export OPENAI_API_KEY=your_key
docker compose up
```

### 运行测试

```bash
cd backend && python -m pytest tests/ -v
cd frontend && npx tsc --noEmit && npx vite build
```
