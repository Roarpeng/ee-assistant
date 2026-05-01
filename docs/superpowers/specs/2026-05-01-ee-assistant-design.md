# EE Assistant Design Spec

## Overview

电气工程师助手 Web 应用，面向专业电气工程师在工业自动化领域进行日常辅助设计。用户通过自然语言/结构化表单/文件上传描述需求，系统分析拆解需求，推荐元器件选型，生成框图级电气原理图，并输出 PLC ST 代码框架。

## Users & Context

- **目标用户：** 专业电气工程师
- **领域：** 工业自动化（PLC控制柜、电机驱动、传感器/执行器回路）
- **PLC品牌：** 先西门子（S7-1200/S7-1500/TIA Portal）单品牌验证，架构预留多品牌扩展
- **使用场景：** 方案阶段快速出图出BOM、技术交流、设计评审准备

## Core Workflow

```
需求输入 → 需求拆解 → 选型推荐 → 原理图生成 → ST代码生成
  用户可       用户可       用户可       用户可
  修改补充     编辑修正     调整替换     确认/细化
```

每个阶段产出均支持用户编辑，修改后重新触发下游流程。

## System Architecture

### Overall Deployment

Docker Compose 统一部署，5 个服务：

| 服务 | 端口 | 用途 |
|------|------|------|
| frontend | 80 | React SPA via Nginx |
| backend | 8000 | FastAPI + WebSocket |
| qdrant | 6333 | 向量数据库 (RAG) |
| postgres | 5432 | 关系数据持久化 |
| minio | 9000 | PDF/文件对象存储 |

### Backend Architecture

```
API层 (FastAPI)
  ├── projects.py      # 项目CRUD
  ├── analysis.py      # 需求分析
  ├── selection.py     # 选型推荐
  ├── schematic.py     # 原理图生成
  ├── codegen.py       # ST代码生成
  └── knowledge.py     # 知识库管理

编排层 (Orchestrator)
  状态机管理分析流程，协调 LLM/RAG/Rule 调用，通过 WebSocket 推送进度

核心层 (Core)
  ├── llm_service.py   # LLM 抽象层 (Claude为主，可切换)
  ├── rag_engine.py    # Qdrant 检索
  ├── rule_engine.py   # 选型规则校验
  └── schemas.py       # Pydantic 数据模型 (+ 导出JsonSchema给前端)
```

### Frontend Architecture — MVS

```
frontend/src/
├── models/              # M: 数据模型 + 状态管理
│   ├── project.ts       # Project, Requirement, IOList 类型定义
│   ├── selection.ts     # BOMItem, Component 类型 + 置信度枚举
│   ├── schematic.ts     # FrameworkNode, Edge 类型
│   ├── codegen.ts       # STModule, CodeBlock 类型
│   └── store.ts         # Zustand 全局状态
├── views/               # V: UI 组件
│   └── components/
│       ├── ChatPanel.tsx           # 左侧对话框
│       ├── CanvasPanel.tsx         # 右侧画布容器
│       ├── FrameworkDiagram.tsx    # 框架图渲染 (Mermaid/SVG)
│       ├── BOMTable.tsx            # 选型BOM表
│       ├── STCodeView.tsx          # ST代码 (Monaco Editor)
│       ├── KnowledgePanel.tsx      # 知识库管理
│       ├── ProgressStepper.tsx     # 流程步骤指示器
│       ├── ExportToolbar.tsx       # 导出工具栏
│       └── FileDropZone.tsx        # 文件拖拽上传
└── services/            # S: 业务逻辑 + API通信
    ├── api.ts           # HTTP 客户端 (fetch封装)
    ├── websocket.ts     # WebSocket 进度订阅
    ├── export.ts        # 导出服务 (SVG/Excel/PDF/打印)
    └── analysis.ts      # 分析流程状态机
```

### UI Layout

```
┌────────────────────┬──────────────────────────────────┐
│  左侧 30%           │  右侧 70%                         │
│                    │                                   │
│  ┌──────────────┐  │  ┌─────────────────────────────┐  │
│  │ ChatPanel    │  │  │  ExportToolbar               │  │
│  │              │  │  │  [SVG] [Excel] [PDF] [打印]   │  │
│  │ 消息对话流    │  │  ├─────────────────────────────┤  │
│  │              │  │  │  CanvasPanel                 │  │
│  │ 输入框 +     │  │  │  ┌─────────────────────────┐ │  │
│  │ FileDropZone │  │  │  │ FrameworkDiagram        │ │  │
│  │              │  │  │  │ (Mermaid + 交互overlay)  │ │  │
│  │              │  │  │  └─────────────────────────┘ │  │
│  │              │  │  │  ┌─────────────────────────┐ │  │
│  │              │  │  │  │ BOMTable                 │ │  │
│  │              │  │  │  │ 型号|规格|数量|依据|来源  │ │  │
│  │              │  │  │  └─────────────────────────┘ │  │
│  │              │  │  │  [Tab] STCodeView            │  │
│  └──────────────┘  │  └─────────────────────────────┘  │
└────────────────────┴──────────────────────────────────┘
```

## Module Design

### 1. Requirements Analysis → Structured Document

**Input Modes:**
- Natural language text (via chat)
- Structured form (pre-defined fields: motor power/count, IO count, SIL level, communication protocol, etc.)
- File upload: PDF/images parsed via multimodal LLM or OCR

**Output — Structured Requirement JSON:**

```json
{
  "project_requirement": {
    "general": {
      "machine_type": "conveyor",
      "safety_level": "SIL2",
      "environment": "indoor"
    },
    "io_list": [
      { "tag": "M1_START", "type": "DI", "description": "电机1启动按钮" },
      { "tag": "M1_RUN", "type": "DO", "description": "电机1运行输出" }
    ],
    "control_logic": [
      "电机1启动后延时2秒启动电机2",
      "急停时所有电机立即停止"
    ],
    "constraints": {
      "plc_family": "S7-1200",
      "budget": null,
      "cabinet_size": null
    }
  }
}
```

### 2. RAG Knowledge Base (User-Managed)

**Features:**
- PDF/image upload with drag-and-drop batch support
- Smart chunking at section/table boundaries (preserves table integrity)
- Tag system: manufacturer (Siemens/Schneider), category (breaker/contactor/PLC), model series
- Search: filter by tag/category first, then semantic search to reduce false matches
- Chunk viewing: user can inspect original source text behind any recommendation

**Tech Stack:** PDF parsing (PyMuPDF) → text extraction → smart chunking → embedding (text-embedding-3-small) → Qdrant

### 3. Component Selection Engine

Flow:

```
Structured Requirement
  → Category Mapping (LLM): function → needed component categories
  → RAG Search (Qdrant): per category, filter by rated voltage/current/power
  → LLM Supplement: fill gaps where RAG coverage insufficient (marked as LLM-inferred)
  → Rule Engine Validation: hard constraints —
      - Breaker rated current ≥ total load × 1.25
      - SIL2+ requires redundant safety circuit devices
      - Intra-cabinet devices must share communication protocol (PROFINET/PROFIBUS)
      - Motor starter voltage must match PLC output module voltage
  → BOM Output: sorted by confidence/cost, each item includes model/spec/reasoning/source/alternative
```

**Tiered Confidence Display:**
- ✅ Green/Document icon: recommendation backed by manufacturer manual (RAG)
- ⚡ Yellow/Warning icon: LLM-inferred recommendation (no manual basis)
- Both tiers clearly separated, user can filter by confidence

### 4. Schematic Generation

Block-diagram level using Mermaid generation + interactive overlay:

- LLM generates Mermaid flowchart from BOM + control logic
- Frontend renders via react-mermaid, adds click/tooltip overlay
- Block elements: power feed → main switch → distribution → functional modules (motor drive/IO/safety/comms)
- Click each block to expand internal devices and parameters
- User can drag to adjust layout, modify connections
- Export: SVG (vector), PNG (raster), direct print

### 5. ST Code Generation

**Output levels:**
1. Program structure: FC/FB/OB decomposition tree
2. IO mapping table: Siemens TIA Portal format (%I, %Q, %IW, %QW)
3. FC/FB code skeleton: block declaration + comment logic framework + complete safety logic

**Principles:**
- Safety logic always complete (E-Stop, safety door, interlocks) — never left as placeholder
- Regular logic: framework + comments, refinable on demand
- IO mapping auto-generated, user-adjustable
- Output: TIA Portal format + plain text ST

**Presentation:** Monaco Editor with ST syntax highlighting, module tree sidebar

### 6. Export

Framework diagram export:
- SVG (vector, editable)
- PNG (raster)
- PDF report (combined diagram + BOM + description)
- Direct print

BOM table export:
- Excel (.xlsx) with formatted columns
- PDF report
- CSV (lightweight)

## Data Model (Key Entities)

```
Project
  ├── id, name, created_at, updated_at
  ├── Requirement (1:1)
  ├── BOM (1:N BOMItem)
  ├── Schematic (1:1)
  └── CodeModules (1:N STModule)

Requirement
  ├── machine_type, safety_level, environment
  ├── IOList (1:N IOItem)
  └── ControlLogic (1:N LogicRule)

BOMItem
  ├── category, manufacturer, model, quantity
  ├── specifications (JSON)
  ├── confidence: rag | llm | mixed
  ├── source_reference (RAG chunk ID or null)
  └── alternative_models (JSON)

KnowledgeDoc
  ├── id, filename, manufacturer, category_tags
  ├── chunks (1:N Chunk)
  └── uploaded_at

Chunk
  ├── id, doc_id, content, embedding_id (Qdrant)
  └── metadata (page, section, tables)
```

## Tech Stack Summary

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | React 18 + TypeScript + Tailwind CSS | Modern SPA |
| State | Zustand | Lightweight, MVS-friendly |
| Code Editor | Monaco Editor | VS Code heritage, ST highlighting |
| Diagram | react-mermaid + SVG overlay | Lightweight block diagrams |
| Backend | FastAPI + WebSocket | Async, streaming progress |
| LLM | Anthropic Claude (abstraction layer) | Swappable provider |
| Vector DB | Qdrant | High performance, Docker-friendly |
| Relational | PostgreSQL 16 | Project/user/data persistence |
| Object Storage | MinIO (S3-compatible) | PDF manual storage |
| Rule Engine | Embedded Python functions | MVP simplicity |
| Deployment | Docker Compose | Single-command deploy |
| PDF Parsing | PyMuPDF | Table-aware extraction |

## MVP Scope

End-to-end lightweight flow for Siemens S7-1200 family:
- Natural language input (text + file upload) for one conveyor/motor-control scenario
- Structured requirement output with IO list
- At least 2-3 manufacturer PDFs pre-loaded for RAG validation
- 5-8 hard validation rules in rule engine
- Block-diagram schematic generation
- ST code framework with complete safety interlocks
- Export: SVG + Excel + basic PDF report
- Knowledge base management UI (upload, tag, search, view chunks)

## Non-Goals (v1)

- Multi-PLC brand support (architecture reserves extension points)
- Full CAD-format schematic export (EPLAN/AutoCAD)
- Real PLC communication / online debugging
- User authentication / multi-tenancy
- Automated compliance certification (IEC 61508 SIL verification)

## Open Questions

- Which specific Siemens S7 family manuals to pre-load for MVP?
- Should the ST code output target a specific TIA Portal version (V17/V18/V19)?

---

**Status:** Approved | **Date:** 2026-05-01
