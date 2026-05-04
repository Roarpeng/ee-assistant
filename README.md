# Volta — 电气工程师助手 (LangGraph Multi-Agent)

面向工业自动化领域的电气工程设计辅助工具。自然语言输入 → 需求拆解 → 元器件选型 → 原理图生成 → PLC ST 代码输出。

## 核心功能

| 模块 | 说明 |
|------|------|
| **需求分析** | 自然语言输入 → LangGraph 9-Agent DAG → 结构化需求（I/O清单、控制逻辑、安全等级） |
| **元器件选型** | RAG 双路检索（Qdrant 语义 + 知识图谱 BFS）+ 规则引擎校验（5条硬约束） |
| **原理图生成** | 基于选型BOM自动生成 Mermaid 框图，可导出 SVG |
| **ST 代码生成** | 西门子 S7-1200/1500 TIA Portal 格式，安全逻辑完整实现 |
| **知识库管理** | PDF 上传, 自动分块+向量化, 异步处理+WS进度, 批量删除, 失败重试 |
| **LLM 连通性测试** | 设置面板一键测试 Chat + Embedding 两组 API 连通性 |

## 技术栈

**前端:** React 18 + TypeScript + Tailwind CSS + Zustand + Monaco Editor + Mermaid  
**后端:** FastAPI + WebSocket + LangGraph + SQLAlchemy 2 (async) + Pydantic v2  
**LLM:** OpenAI-compatible (支持 DeepSeek / Claude / GPT, Chat + Embedding 独立配置)  
**基础设施:** PostgreSQL 16 + Qdrant + MinIO + nginx

## 快速开始

### 全 Docker 一键部署（推荐）

```bash
docker compose up -d --build
docker exec ele-backend-1 alembic upgrade head
```

访问 `http://localhost`（前端 nginx → 后端 API 自动代理）

### 本地开发

```bash
# 基础设施
docker compose up -d postgres qdrant minio

# 后端
cd backend && pip install -r requirements.txt
PYTHONPATH=. alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 前端
cd frontend && npm install && npm run dev   # → http://localhost:5173
```

### 配置

打开前端 → 右上角齿轮 → 设置：
- **Chat**: API Key, Base URL, Model（用于需求分析和代码生成）
- **Embedding**: API Key, Base URL, Model, Dimension（用于知识库向量化）
- 点 ⚡ 测试连通性 验证配置

### 运行测试

```bash
cd backend && python -m pytest tests/ -v
cd frontend && npx tsc --noEmit && npx vite build
```
