# LangGraph Multi-Agent Refactor + Frontend Style Upgrade

## Overview

将当前单模型多 Prompt 的流水线架构重构为 LangGraph StateGraph 驱动的多 Agent 协作架构，同时将前端升级为 B/C 融合风格（浅色默认+暗色切换，Linear/Notion 干净感 + VS Code/GitHub 工程工具气质）。

## Current vs Target

| 维度 | 当前 | 目标 |
|------|------|------|
| Agent 模型 | 单 LLMService，4 个方法 4 个 prompt | 每节点独立 Agent，有独立 system prompt + 工具 |
| 流程控制 | API 端点手动串行调用 | LangGraph StateGraph，条件分支+并行+重试 |
| 状态持久化 | 无（仅 ORM 存结果） | LangGraph MemorySaver/SqliteSaver，断点续跑 |
| RAG 搜索 | 串行逐品类搜索 | fan-out 并行搜索，结果汇聚 |
| 校验 | 仅选型后规则引擎 | 选型后规则引擎 + Final Review Agent 交叉校验 |
| 前端风格 | 基础 Tailwind | 设计 token 体系 + 浅/暗双主题 + Inter 字体 |
| 布局 | 固定 30/70 分栏 | 可拖拽调整宽度的分栏 |

## Backend: LangGraph Agent Topology

```
START
  │
  ▼
RequirementsAgent ─── 结构化需求 + I/O 清单
  │
  ├──► CategoryMapper (fan-out: 并行分析 I/O 类型)
  ├──► SafetyAssessor (提取 SIL 等级 + 安全需求)
  └──► ConstraintExtractor (预算/尺寸/品牌约束)
  │
  ▼ (汇聚)
SelectionSupervisor ─── 并行搜索 (RAG语义 + 图遍历)
  │   ┌─ search_knowledge_base(cat) → Qdrant 语义 + 图邻居
  │   ├─ find_compatible(node) → BFS 图遍历找兼容设备
  │   └─ llm_supplement(cat) → 无结果时 LLM 推理
  │
  ▼
RuleValidator ─── 5 条硬约束校验，输出 violations
  │
  ├──► SchematicGenerator ─── Mermaid 框图
  ├──► CodeGenerator     ─── ST 代码模块
  └──► FinalReviewAgent  ─── 交叉校验 BOM 完整性 + 安全合规
  │
  ▼
END
```

### Agent 定义

| Agent | 职责 | 工具 |
|-------|------|------|
| RequirementsAgent | 自然语言→结构化需求 JSON | Claude API + structured output |
| CategoryMapper | I/O 清单→所需元器件品类 | Claude API |
| SafetyAssessor | 提取 SIL 等级、安全功能需求 | 无（纯推理） |
| ConstraintExtractor | 提取预算/尺寸/品牌偏好约束 | 无（纯推理） |
| SelectionSupervisor | 协调并行搜索(RAG+Graph)+LLM补充 | RAGEngine.search, ComponentGraph.traverse, Claude API |
| RuleValidator | 5 条硬约束规则校验 | rule_engine.validate_all |
| SchematicGenerator | BOM+需求→Mermaid 框图 | Claude API |
| CodeGenerator | BOM+需求→ST 代码模块 | Claude API |
| FinalReviewAgent | BOM 完整性+安全合规交叉检查 | Claude API |

### StateGraph 定义

```python
class AnalysisState(TypedDict):
    project_id: str
    user_input: str
    # 中间产物
    requirement: dict | None
    categories: list[str] | None
    safety_level: str | None
    constraints: dict | None
    bom_items: list[dict] | None
    violations: list[dict] | None
    mermaid_code: str | None
    st_modules: list[dict] | None
    review_notes: list[str] | None
    # 图遍历上下文
    graph_traces: list[dict]  # BFS 路径记录，用于溯源
    # 流程控制
    errors: list[str]
    stage: str
```

## Backend Module Changes

### 新增文件

```
backend/app/core/
├── graph/
│   ├── __init__.py
│   ├── state.py          # AnalysisState TypedDict
│   ├── agents.py          # 各 Agent 节点函数
│   └── builder.py         # StateGraph 构建 + compile
├── knowledge_graph.py     # ComponentGraph: 图 CRUD + BFS 遍历
├── entity_extractor.py    # LLM 实体/关系提取
└── community_detector.py  # NetworkX Louvain 社区检测
```

### 修改文件

| 文件 | 变化 |
|------|------|
| `db/models.py` | 新增 `ComponentNode`, `ComponentEdge` ORM 模型 |
| `core/orchestrator.py` | 改为调用 LangGraph graph.ainvoke()，保留 WebSocket push |
| `core/rag_engine.py` | 增加 `search_with_graph_neighbors()` 方法 |
| `api/analysis.py` | `/analyze` 端点触发 graph run，返回 run_id |
| `api/selection.py` | 移除，合并进 graph 的 SelectionSupervisor 节点 |
| `api/schematic.py` | 简化为从 state 读取结果，或合并进 graph |
| `api/codegen.py` | 同上 |
| `requirements.txt` | 添加 `langgraph`, `langgraph-checkpoint-sqlite`, `networkx`, `python-louvain` |

## Frontend: B/C Fusion Style System

### Design Tokens

```css
:root {
  /* Light (default) */
  --color-bg-primary: #fafafa;
  --color-bg-secondary: #ffffff;
  --color-bg-tertiary: #f5f5f4;
  --color-text-primary: #1a1a2e;
  --color-text-secondary: #6b7280;
  --color-border: #e5e7eb;
  --color-accent: #2563eb;
  --color-accent-hover: #1d4ed8;
  --color-success: #059669;
  --color-warning: #d97706;
  --color-error: #dc2626;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.07);
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}

[data-theme="dark"] {
  --color-bg-primary: #0d1117;
  --color-bg-secondary: #161b22;
  --color-bg-tertiary: #21262d;
  --color-text-primary: #e6edf3;
  --color-text-secondary: #8b949e;
  --color-border: #30363d;
  /* accent/success/warning/error 暗色变体 */
}
```

### 组件风格映射

| 组件 | 当前 | 目标风格 |
|------|------|----------|
| ChatPanel | 基础消息列表 | Notion-like 气泡+时间戳，紧凑输入框 |
| CanvasPanel | 固定 tab | VS Code 风格 tab bar + 可拖拽面板 |
| BOMTable | 基础 table | 类 Linear 表格，行 hover 高亮，置信度彩色标签 |
| FrameworkDiagram | Mermaid 渲染 | 浅色/暗色自动切换的 Mermaid 主题 |
| STCodeView | Monaco Editor | 保持 Monaco，暗色模式联动 |
| KnowledgePanel | 基础列表 | Notion-like 卡片网格+搜索栏 |
| ProgressStepper | 基础步骤条 | Linear-like 细线进度指示器 |

### 新增组件

- `ThemeToggle.tsx` — 浅/暗切换按钮（Header 右上角）
- `ResizablePanel.tsx` — 可拖拽分栏容器

## Component Knowledge Graph (核心改造)

### 问题

当前知识库是**扁平向量检索**：`PDF → chunk → embedding → 相似度搜索`。这无法回答：

- "这个电流传感器的供电电压是多少？"
- "哪些继电器和它的输出信号兼容？"
- "如果要替换这个断路器，有哪些同规格替代品？"

电气元件的核心特征是**结构化属性 + 类型化关联**，而非自由文本相似度。

### 参考项目

| 项目 | 核心思路 | 对本项目的启发 |
|------|----------|---------------|
| **graphify** | 代码/文档 → 实体+关系提取 → 社区聚类 → 图查询 | 节点/边/置信度模型、EXTRACTED vs INFERRED 区分 |
| **Microsoft GraphRAG** | 实体提取 → 社区摘要 → 全局/局部搜索 | 社区检测用于发现元件族系（同类器件聚类） |
| **Neo4j + LangChain** | 图数据库 + Cypher 查询 + LLM 生成查询 | 图遍历查询语法，但不引入新基础设施 |
| **LlamaIndex KGIndex** | 文档 → (实体, 关系, 实体) 三元组 → 知识图谱 | `REQUIRES_POWER` / `OUTPUTS_SIGNAL` 等电气领域关系设计 |

### 方案选择

采用 **PostgreSQL 图表模式**（不引入 Neo4j 等新服务），原因：
- 项目已用 PostgreSQL，零额外运维
- 电气元件知识图规模可控（千级节点）
- 递归 CTE 可覆盖核心图遍历需求
- 后续可平滑迁移到 Apache AGE（PG 图扩展）

### 图数据模型

```
┌──────────────────────────────────────────────────────┐
│  component_nodes                                      │
│  ┌──────────┬──────────┬──────────────────────────┐  │
│  │ id (UUID)│ type     │ properties (JSONB)        │  │
│  ├──────────┼──────────┼──────────────────────────┤  │
│  │ n1       │ Sensor   │ {name:"SCT-013",         │  │
│  │          │          │  type:"current",          │  │
│  │          │          │  rated_current:"100A",    │  │
│  │          │          │  output_signal:"4-20mA",  │  │
│  │          │          │  supply_voltage:"24VDC"}  │  │
│  │ n2       │ PLC_AI   │ {name:"SM 1231",          │  │
│  │          │          │  input_signal:"4-20mA",   │  │
│  │          │          │  resolution:"13bit"}      │  │
│  │ n3       │ PSU      │ {name:"SITOP PSU100C",   │  │
│  │          │          │  output_voltage:"24VDC",  │  │
│  │          │          │  power:"60W"}             │  │
│  └──────────┴──────────┴──────────────────────────┘  │
│                                                       │
│  component_edges                                      │
│  ┌──────────┬──────────┬─────────────────────────┐   │
│  │ source   │ target   │ relation + properties    │   │
│  ├──────────┼──────────┼─────────────────────────┤   │
│  │ n1→n3    │REQUIRES  │ {voltage:"24VDC"}       │   │
│  │ n1→n2    │OUTPUTS   │ {signal:"4-20mA",       │   │
│  │          │          │  type:"analog"}          │   │
│  └──────────┴──────────┴─────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### 关系类型

| 关系 | 方向 | 含义 | 示例 |
|------|------|------|------|
| `REQUIRES_POWER` | 元件→电源 | 元件需要的供电规格 | 传感器→24VDC电源 |
| `OUTPUTS_SIGNAL` | 传感器→输入模块 | 输出信号类型和量程 | 电流传感器→AI模块 (4-20mA) |
| `USES_PROTOCOL` | 设备→协议 | 通信协议 | 变频器→PROFINET |
| `COMPATIBLE_WITH` | 元件↔元件 | 已验证兼容 | 特定接触器↔特定断路器 |
| `ALTERNATIVE_TO` | 元件→元件 | 可替代关系 | 施耐德型号→西门子型号 |
| `MOUNTS_ON` | 元件→导轨/底板 | 安装方式 | 端子排→DIN35导轨 |
| `CONTROLS` | 输出模块→执行器 | 控制关系 | DO模块→接触器线圈 |

### 知识提取流程

```
PDF 上传
  │
  ▼
PyMuPDF 提取文本 + 表格
  │
  ├──► Vector Path (保留): chunk → embedding → Qdrant (语义搜索)
  │
  └──► Graph Path (新增): 
        │
        ▼
      LLM Entity Extraction
        │  输入: 文本 chunks
        │  Prompt: "从以下技术文档中提取电气元件及其属性..."
        │  输出: [{name, type, properties}, ...]
        │
        ▼
      LLM Relation Extraction  
        │  输入: 提取的实体 + 文档上下文
        │  Prompt: "识别元件之间的电气关联..."
        │  输出: [{source, target, relation, properties}, ...]
        │
        ▼
      合并到 PostgreSQL 图表
        │  - 同型号元件合并为同一节点 (upsert)
        │  - 边去重 + 置信度累加
        │  - 标记来源文档 (溯源)
        │
        ▼
      社区检测 (NetworkX Louvain)
        │  发现元件族系: "24V供电回路" / "PROFINET设备群" / "安全回路组件"
        │
        ▼
      存储社区标签到 component_nodes.community
```

### 图遍历选型 (替换 RAG-only 搜索)

Selection Agent 的 tool 升级为：

```
SelectionSupervisor
  ├─ tool: search_knowledge_base(category, top_k=3)
  │     └─ 双路检索:
  │          1) Qdrant 语义搜索 (现有)
  │          2) 图邻居查询: MATCH (n:{category})-[r]-(m) RETURN n, r, m
  │        结果合并去重，图结果标记 "graph" 来源
  │
  ├─ tool: find_compatible(source_component, relation)
  │     └─ 图遍历: 从 source_component 沿 REQUIRES_POWER / OUTPUTS_SIGNAL /
  │       USES_PROTOCOL 边 BFS 2 跳，返回兼容元件列表
  │       例: 电流传感器 → (OUTPUTS_SIGNAL) → AI模块 → (USES_PROTOCOL) → 通信处理器
  │
  └─ tool: llm_supplement(category, context) → ComponentSuggestion (保留)
```

### 图在选型中的价值

以电流传感器为例：

```
用户需求: "检测3台电机电流，4-20mA输出"
  │
  ▼
Qdrant 搜索 "current sensor 4-20mA"
  → SCT-013 (电流传感器，输出4-20mA，需要24VDC供电)
  │
  ▼ 图遍历: SCT-013 → REQUIRES_POWER → ?
  → SITOP PSU100C (24VDC/60W电源)
  │
  ▼ 图遍历:  SCT-013 → OUTPUTS_SIGNAL → ?
  → SM 1231 AI (4-20mA输入，13bit分辨率)
  │
  ▼ 图遍历:  SM 1231 → USES_PROTOCOL → ?
  → 通过 S7-1200 背板总线 (已知)
  │
  ▼ 规则校验: 3台电机 → 需要3个传感器 → 3 × 需求 → PSU 功率够不够?
  → 3 × (传感器功耗) < 60W  ✓
```

## Knowledge Base Integration

知识库从 `selection.py` 端点中解耦，改为 LangGraph Agent 节点的 tool。上传流程保留现有 API，增加图提取步骤。

### 新增文件

```
backend/app/core/
├── graph/
│   ├── __init__.py
│   ├── state.py          # AnalysisState TypedDict
│   ├── agents.py          # 各 Agent 节点函数
│   └── builder.py         # StateGraph 构建 + compile
├── knowledge_graph.py     # ComponentGraph: 图 CRUD + 遍历
├── entity_extractor.py    # LLM 实体/关系提取
└── community_detector.py  # NetworkX Louvain 社区检测
```

### 修改文件

| 文件 | 变化 |
|------|------|
| `db/models.py` | 新增 `ComponentNode`, `ComponentEdge` ORM 模型 |
| `core/rag_engine.py` | 增加 `search_with_graph_neighbors()` 方法 |

## Dependencies

```
# backend/requirements.txt 新增
langgraph>=0.2.0
langgraph-checkpoint-sqlite>=1.0.0
networkx>=3.0           # 社区检测 + 图遍历算法
python-louvain>=0.16    # Louvain 社区检测
```

## Migration Strategy (更新)

分 4 个阶段，每阶段可独立验证：

### Phase 0: Schema (先于 Agent)
1. 新增 `component_nodes`, `component_edges` ORM 模型 + migration
2. 实现 `knowledge_graph.py` (图 CRUD + BFS 遍历)
3. 实现 `entity_extractor.py` (LLM 实体+关系提取)
4. 实现 `community_detector.py` (NetworkX Louvain)
5. 知识库上传流程增加图提取步骤（与现有向量路径并行）

### Phase 1: Infrastructure
6. 安装 langgraph + langgraph-checkpoint-sqlite + networkx
7. 创建 `backend/app/core/graph/` 模块骨架
8. 实现 AnalysisState + 空 graph builder
9. 前端添加 design tokens + ThemeToggle

### Phase 2: Agent 迁移
10. 实现各 Agent 节点函数（含图遍历 tool）
11. 构建完整 StateGraph
12. 新增 `/api/projects/{id}/analyze-v2` 端点
13. 新旧端点共存，WebSocket 推送 graph 状态

### Phase 3: 前后端联动
14. 前端适配 graph 状态消息格式
15. 前端 KnowledgePanel 增加图可视化 (D3-force 或 vis-network)
16. 移除旧端点，清理代码
17. 全流程集成测试

## Non-Goals

- 不引入独立 Agent 框架（CrewAI/AutoGen）— LangGraph 即可满足
- 不引入独立图数据库（Neo4j）— PostgreSQL 图表模式覆盖核心需求
- 不改造 Monaco Editor 本身（仅主题联动）
- 不引入新的向量数据库或消息队列
- 不做用户认证/多租户

---

**Status:** Draft | **Date:** 2026-05-03
