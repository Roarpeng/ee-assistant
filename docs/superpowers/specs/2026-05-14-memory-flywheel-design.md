# Volta 记忆飞轮设计

**Date**: 2026-05-14
**Status**: design → ready to implement (M0 onward)
**Parent**: 跟随 `2026-05-14-blueprint-ui-refresh-design.md` + `2026-05-14-backend-ui-data-channels-design.md` 之后的核心架构升级
**Owner**: Volta

---

## 1. Why this exists

Volta 当前是一个**功能完整但失忆**的工程助手：

- LangGraph 用 `MemorySaver`，进程 RAM，重启即丢
- 聊天历史在浏览器 localStorage，服务端零持久化
- 工程师 interrupt 时的手动选型 = 行业最贵的标签数据，**只塞进当前 BOM，不回写 KB**
- 没有用户/组织身份概念，同一家客户的偏好每次重新问
- 项目 N 教训不能帮项目 N+1

> **从"会工作"到"会学习"的差距，是 2026 工业 AI agent 的护城河。**

---

## 2. Market positioning（设计参考）

| 流派 | 核心想法 | 我们借鉴的部分 |
|---|---|---|
| **Mem0**（2026.04 新算法） | ADD-only 抽取 + vector/BM25/entity 三信号融合 | episodic 检索的多信号融合思路 |
| **Zep / Graphiti** | 时序知识图谱，边带生命周期 | sleep-time consolidation 写回图谱 |
| **Letta (MemGPT)** | Core/Recall/Archival 三级 + sleep-time compute | 五层分层架构 |
| **Claude Memory Tool** | `/memories/` 目录 + LLM 自管 | 不直接借鉴；过于通用 |
| **Cursor AGENTS.md** | 项目根 markdown 持续学习 | 不直接借鉴；我们要结构化 |
| **ChatGPT Memory Sources** | 给用户看"记住了什么、为什么" | **直接借鉴 → 透明化 UI** |
| **LangMem / PostgresStore** | LangGraph 原生 store | **直接采用 → L0 替换 MemorySaver** |
| **Airbnb AITL（数据飞轮）** | 4 类反馈：偏好/采纳/相关性/缺失 | **直接采用 → L3 飞轮核心** |
| **NVIDIA MAPE Flywheel** | Monitor-Analyze-Plan-Execute 闭环 | 周报 / 缺口监控 |

**关键 takeaway**：长期记忆 = 表演级功能；**数据飞轮 = 商业护城河**。优先把闭环跑通，再加规模。

---

## 3. Architecture — 五层记忆

```
┌─────────────────────────────────────────────────────────────────┐
│ L4 静态知识 KB（已有：Qdrant + component_graph）  ← sleep-time   │
│    consolidation 把 L3 沉淀的规律提炼为图谱规则                  │
├─────────────────────────────────────────────────────────────────┤
│ L3 工程经验 Episodic Memory ★ 飞轮核心 [新]                     │
│    4 类反馈：manual_select / edits / clarify / missing           │
│    存储：episodic_memories 表 + Qdrant `ee_episodes`             │
├─────────────────────────────────────────────────────────────────┤
│ L2 组织偏好 Organization Profile [新]                            │
│    organizations + org_preferences (键值对)                      │
│    ClarifyCard 答案 → 自动回写，下次同 org 项目不再问            │
├─────────────────────────────────────────────────────────────────┤
│ L1 项目记忆 Project [扩充现有]                                   │
│    projects + requirements + bom_items + ... (现有)              │
│    新增 run_history + decisions 表                               │
│    修 1:1 unique bug                                              │
├─────────────────────────────────────────────────────────────────┤
│ L0 工作记忆 Working [替换]                                       │
│    MemorySaver → PostgresSaver（LangGraph 原生）                 │
│    新增 chat_messages 表，前端 localStorage 降为缓存              │
└─────────────────────────────────────────────────────────────────┘
```

### 3.1 身份模型决策

**只引入 `Organization`，不引入 `User`**。

- 工业自动化项目所有权天然属于"客户/工厂"，不属于个人工程师
- 偏好（PLC 品牌、电压标准、安全等级）也属组织级
- 一个 token 对应一个 org，HTTP header `X-Volta-Org-Token` 标识
- `projects` 表加 `org_id` FK，向后兼容（旧项目 `org_id = NULL`）

延后到将来：个人级 User、SSO、细粒度权限。

### 3.2 L0 工作记忆（替换 MemorySaver）

| 改动 | 现状 | 新状态 |
|---|---|---|
| LangGraph checkpointer | `langgraph.checkpoint.memory.MemorySaver` | `langgraph.checkpoint.postgres.PostgresSaver` |
| 聊天源 | 浏览器 localStorage `volta-chat-history` | Postgres `chat_messages`（role, content, options, project_id, ts），前端只做缓存 |
| 项目工件重跑 | `requirements`/`schematics` 1:1 unique → 重跑失败 | `delete-then-insert` per project_id |

### 3.3 L1 项目记忆（扩充）

新表：

```sql
run_history (
    id UUID PK, project_id FK,
    started_at TS, finished_at TS,
    nodes_executed JSONB,  -- {node_name: ms_elapsed}
    errors JSONB,
    final_stage TEXT
)

decisions (
    id UUID PK, project_id FK, org_id FK NULL,
    type TEXT,  -- 'manual_select' | 'bom_edit' | 'wiring_edit' | 'topology_edit' | 'clarify' | 'thumbs_down'
    context JSONB,    -- 触发时的请求快照
    before JSONB,     -- 系统建议（如有）
    after JSONB,      -- 用户实际选择
    rationale TEXT,   -- 可选用户备注
    ts TS
)
```

`decisions` 是飞轮原料的归集表。后续 L3 / L4 都消费它。

### 3.4 L2 组织偏好（全新）

```sql
organizations (
    id UUID PK, name TEXT, code TEXT UNIQUE, token_hash TEXT,
    created_at TS
)

org_preferences (
    org_id FK, key TEXT, value JSONB,
    confidence FLOAT,        -- 0..1，多次确认会升
    source TEXT,             -- 'clarify' | 'admin' | 'inferred'
    updated_at TS,
    PRIMARY KEY (org_id, key)
)
```

预设 key 集合：`preferred_plc_family` / `default_safety_level` / `voltage_standard` / `brand_blacklist` / `default_environment` / `preferred_hmi_brand` ...

**RequirementsAgent enrichment**：解析 user_input 之后，缺失字段先查 `org_preferences`（confidence ≥ 0.6 直接填，0.3-0.6 在 ClarifyCard 里设为默认选中）。

### 3.5 L3 工程经验 Episodic Memory（飞轮核心）

**4 类反馈，全部收**：

| 类型 | 触发点 | 写入 |
|---|---|---|
| **A. Manual Selection** | LangGraph interrupt → resume 时 `manual_selections` | (1) `decisions` 表 type=`manual_select` (2) `component_graph` edge weight +1（cat × manufacturer × model）(3) Qdrant `ee_episodes` 一条向量化 episode |
| **B. Edit Acceptance** | 前端 BOM/接线/拓扑提交编辑 → 新 API `POST /api/projects/{id}/feedback/edit` | (1) `decisions` type=`*_edit` (2) episode：「[需求 X] 系统推荐 Y，工程师改为 Z」 |
| **C. Clarification Answer** | ClarifyCard 选完点确认 | (1) `decisions` type=`clarify` (2) `org_preferences` upsert with confidence bump |
| **D. Missing Feedback** | 用户 👎 / "没找到合适的"按钮 → `POST .../feedback/negative` | (1) `decisions` type=`thumbs_down` (2) `component_graph` 标记 gap，进 admin 待办 |

```sql
episodic_memories (
    id UUID PK, project_id FK, org_id FK NULL,
    requirement_snapshot JSONB,
    bom_snapshot JSONB,
    key_decisions JSONB,        -- [{cat, before, after, rationale}, ...]
    summary TEXT,                -- 一句话总结，给检索用
    embedding_id TEXT,           -- Qdrant point id
    score FLOAT,                  -- 内部"经验质量"评分
    created_at TS
)
```

**写入时机**：分析 done 之后异步任务抽取（先确定性 + 模板，后期可换 LLM 抽取）。

**读取时机**：在 `SelectionSupervisor` 节点开头，用当前 `requirement` 检索 top-3 相似 episode（hybrid search：vector + BM25 + 元数据过滤），注入到 prompt：

```
[历史相似项目经验]
1. WaterTreatment-2024：客户要求 SIL2，最终选 S7-1215C + ET 200SP，
   工程师把推荐的 1212C 升级为 1215C 因为 AI 通道不够。
2. Conveyor-2024：客户黑名单 Schneider，VFD 改用 Siemens G120。
3. ...

请参考以上经验做选型。
```

### 3.6 L4 静态知识 KB + Sleep-Time Consolidation

每天凌晨跑一个 Celery / FastAPI background task：

1. **聚合**：扫描过去 24h 的 `decisions` + `episodic_memories`
2. **挖掘**：找出 ≥3 次相同方向的修改 → 形成候选规则
3. **写回**：
   - 候选规则 ≥ 5 次确认 → 自动写入 `component_graph` 作为新规则
   - 高频被否的组件 → `deprecated=true`，下次选型降权
   - 用户 👎 但 KB 里没替代 → 进 admin 待办
4. **报告**：生成 `weekly_memory_report` 表 + 邮件 / 仪表盘卡片：
   - 本周学到 X 条新规则
   - 修订 Y 条权重
   - 待补 Z 条缺口

参考 NVIDIA MAPE：Monitor（仪表盘）→ Analyze（聚合分析）→ Plan（候选规则）→ Execute（写回 KB）。

---

## 4. Transparency UI（"Memory Sources" 借鉴）

借 ChatGPT 2026.05 的 Memory Sources 体验：用户每次看到一个 AI 决策，能点开"为什么这么决定"。

### 4.1 BOM 选型透明化

每行 BOM 旁边一个 **"i" 小图标**，点开 popover：

```
为什么选 西门子 CPU 1212C DC/DC/DC？

📋 组织偏好    本组织默认 PLC = S7-1200（5 个历史项目）
🧠 工程经验    类似项目 "Slide-2024-08" 也用了这型号
📚 知识库      Siemens-S7-1200-Catalog-v3.2 §4.2
🔍 RAG 相似度   0.89

[这个选错了 👎]   [改成其他型号 ✎]
```

`👎` 触发 D 类反馈；`✎` 触发 A 类反馈。

### 4.2 设置 → 记忆面板

侧边栏新增 **"组织记忆"** 入口（在用户已有的设置弹窗里）：

- **偏好**：表格列出 `org_preferences`，可编辑/删除，每行显示 confidence 和来源
- **经验**：列出最近 N 条 episodes 缩略，可关闭"参考此经验"
- **知识库**：现有 KB 文档列表（已有）
- **周报**：sleep-time 输出的"本周学到/修订/缺口"

### 4.3 ClarifyCard 增强

ClarifyCard 选项里已有的"安全等级 / 环境 / PLC系列"，在每个选项旁加 `(本组织 5 个项目都选这个)` 提示。用户秒选。

---

## 5. 推荐工具栈（决策记录）

| 层 | 选定方案 | 拒绝方案 | 理由 |
|---|---|---|---|
| L0 | LangGraph **PostgresSaver** | Mem0 / 自造 | 单一 DB、跟现有 SQLAlchemy 模型同源、官方支持 |
| L1 | 现有 Postgres + 加 `run_history` / `decisions` | 单独的 trace 系统（LangSmith / Langfuse） | 数据自有；后续可再接观测 |
| L2 | 现有 Postgres + `organizations` / `org_preferences` | Mem0 / Zep | 偏好是结构化键值，向量过度设计 |
| L3 | Qdrant `ee_episodes` + `episodic_memories` 表 | Letta | 飞轮逻辑要可控，Letta 抽象太厚 |
| L4 | 现有 Qdrant + component_graph + sleep-time job | Graphiti | 已经有半个图谱，不另起 |
| **延后** | Mem0 / Zep 作为可选 backend | — | 飞轮跑通后给企业版客户用 |

---

## 6. 分期落地

### M0 — 修地基（约 1 周）

- [ ] `MemorySaver` → `PostgresSaver`（含 alembic migration 建 checkpoint 表）
- [ ] `chat_messages` 表 + 服务端持久化 + 前端降为缓存
- [ ] 修 `requirements`/`schematics` 1:1 unique 重跑 bug（delete-then-insert）
- [ ] BOM/ST 重跑去重逻辑

**验收**：容器 `docker compose restart backend` 后，正在跑的分析进度 + 完整聊天记录都还在。

### M1 — 组织偏好（约 2 周）

- [ ] `organizations` + `org_preferences` 表 + alembic
- [ ] Token-based org 鉴权（`X-Volta-Org-Token` header，写入 SQLAlchemy event hook 标注当前 org_id）
- [ ] `projects.org_id` FK（向后兼容 NULL）
- [ ] `RequirementsAgent` enrichment：缺字段时先查偏好
- [ ] ClarifyCard 答案回写 + 前端"组织记忆"设置面板（最小版）

**验收**：注册一个 org，跑两个项目；第二个项目不再问安全等级/电压/PLC 系列。

### M2 — 飞轮一阶（约 3-4 周）

- [ ] `decisions` + `run_history` 表
- [ ] 4 类反馈采集端点：`POST /api/projects/{id}/feedback/{select|edit|negative}`
- [ ] `interrupt`/`resume` 时自动写 type=`manual_select` 到 `decisions`
- [ ] `component_graph` edge weight 增益逻辑
- [ ] BOM 行 "i" popover（Memory Sources MVP）+ `👎` 按钮

**验收**：同需求第二次跑，selection 自动倾向上次手动选的；BOM 上能看到"为什么是这个"。

### M3 — 飞轮二阶（约 1-2 月）

- [ ] `episodic_memories` 表 + Qdrant `ee_episodes` collection
- [ ] Episode 抽取异步任务（done 后触发）
- [ ] `SelectionSupervisor` 检索 top-3 episode 注入 prompt
- [ ] Sleep-time consolidation 任务 + `weekly_memory_report` 表
- [ ] 周报仪表盘（前端"组织记忆"面板新增 tab）

**验收**：跨项目"上次在 XX 案例我们用了 Y" 自动出现在选型解释里；周报数字非零。

### M4（可选 / 商业化）

- [ ] 抽象 L3 backend 接口，可切到 Mem0 / Zep
- [ ] 给愿意付费客户做"企业记忆"增值

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| PostgresSaver 替换破坏现有进行中分析 | M0 上线时若有 in-flight 分析会中断 | 灰度切换；MemorySaver 保留兜底，新分析走 Postgres |
| 跨 org 数据污染 | 不同客户互相看到偏好 / episode | 所有 L2/L3 读取强制带 `org_id` 过滤，DAO 层兜底 |
| Episode 检索召回低 | L3 注入了无关经验，反而误导 | 阈值控制（score ≥ 0.7 才注入）+ A/B 对比模式 |
| Sleep-time 误将噪声写入 KB | 自动规则污染 component_graph | 候选规则需 ≥5 次确认；写回带 `auto_inferred=true` 标记，可一键回滚 |
| 工程师不点 👎 / 编辑 | 飞轮缺燃料 | M3 时加"BOM 行右键 → 反馈"+ ClarifyCard 强制反馈 |
| Postgres 体积膨胀 | episode/decision 一年百万级 | 90 天后归档到对象存储；保留 summary 在主表 |

---

## 8. Out of scope（明确不做）

- 不做个人 User 级身份 / SSO
- 不引入 Mem0 / Zep / Graphiti 作为强依赖（M4 前都保留为可选）
- 不做 RLHF / 模型微调（飞轮反馈喂的是 KB 与提示，不是模型）
- 不做实时多人协作的画布持久化（Yjs 仍是 P2P，不改）

---

## 9. 决策记录（来自用户确认）

| 决策 | 选择 | 备注 |
|---|---|---|
| 身份模型 | **只引入 Organization，跳过 User** | 工业域天然偏组织所有制 |
| 飞轮反馈源 | **4 类全收（manual/edits/clarify/missing）** | 按 Airbnb AITL 论文完整路径 |
| 透明化 UI | **做 — 每行 BOM 可点"为什么"** | 直接借鉴 ChatGPT Memory Sources |
| 文档形态 | **提交为 spec → M0-M4 实现依据** | 本文件 |

---

## 10. Next step

按 M0 → M4 顺序执行。每个 milestone 单独的 implementation plan 在 `../plans/` 下，遵循 `2026-05-14-backend-ui-data-channels-plan.md` 的 TDD + 小步提交风格。
