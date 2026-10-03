# 电路级原理图自动生成器（Schematic Generator）— 设计稿

**日期**: 2026-10-03
**状态**: Implemented — P0–P3 已落地（P4 EPlan P8 官方导出仍单独立项）
**Owner**: Volta / ee-assistant
**前置阅读**: `docs/PROJECT_OVERVIEW.md` §7（LangGraph DAG）、`backend/app/core/eplan_xml.py`（既有确定性生成器范式）、`docs/LANGGRAPH_FLOW.md`（现有 EPlan XML 契约）

---

## 1. 问题陈述

项目的中心法则已经落地：**拓扑是单一真相源，BOM / 接线表 / EPlan XML / 记忆全部派生自已确认拓扑**。但当前"图"类产物停在设备级：

| 现有产物 | 实现 | 局限 |
|---|---|---|
| Mermaid 框图 | `agents.py::schematic_generator` (L982) + `api/schematic.py` | 系统框图，不是电路 |
| ReactFlow 拓扑图 | `TopologyPanel.tsx` + `CustomNodes.tsx`，9 个 SVG 符号 | 节点=整设备，5 层系统拓扑 |
| EPlan XML | `core/eplan_xml.py`，自定义 `EplanToXmlSchema`（Parts+Connections） | 设备+连接两级，导入 EPlan P8 不会生成原理图页面 |

电气工程师日常交付的**原理图**（IEC 61082 图幅 / IEC 60617·GB/T 4728 符号）包含：主回路（三相进线→隔离开关→断路器→接触器→电机）、控制回路（变压器→熔断器→急停双通道→安全继电器→线圈联锁→线号）、端子排与 IO 回路页。这一层目前完全没有。

**目标**：新增一个派生产物——从已确认拓扑 + BOM + 接线表 + 需求，**确定性优先**地生成电路级原理图文档（多页、带线号与交叉引用），前端可分页浏览，可进导出 ZIP；EPlan P8 官方格式导出作为后期独立阶段。

## 2. Goals / Non-goals

### Goals（按阶段交付）

- G1 定义**原理图中间表示（Schematic IR）**：页 → 图幅分区 → 符号实例（含引脚）→ 电气节点/导线 → 线号/交叉引用 的分层 JSON 模型 + 校验器。
- G2 **主回路 + 控制回路**确定性生成器：从拓扑/BOM 派生，LLM 不参与连通性决策。
- G3 **服务端 SVG 渲染**：IEC 61082 图框 + 标题栏 + 分区坐标，输出可直接打印的页面。
- G4 **IO/端子排页**：复用 `wiring_generator` 行数据生成现场侧回路页，导线截面/线色与接线表一致。
- G5 **线号与交叉引用**：由电气节点网表推导（等电位=同线号），触点↔线圈索引表自动生成。
- G6 前端 **SchematicPanel** 分页查看器 + ReportExporter ZIP 收录原理图页。
- G7 LLM **只做评审与注记**：输出必须通过 IR 校验才被采纳（沿用 `code_generator` 择优范式）。

### Non-goals（本设计明确不做）

- 不做 EPlan P8 官方 schema 导出（P4 单独立项，工作量另估）。
- 不做 PCB / 液压 / 气动原理图。
- 不做手绘风格的自由编辑器——原理图页由生成器产出、用户**确认**而非逐线修改；局部修正走"拓扑修正→重派生"闭环（与接线表同策略）。
- 不替换现有 ReactFlow 拓扑画布（那是真相源编辑器，职责不变）。
- 不引入重量级图形依赖（不装 matplotlib/graphviz）；SVG 用标准库 + ElementTree 生成。

## 3. 约束

**硬约束**

- 技术栈不动：FastAPI + Pydantic v2 + SQLAlchemy async + Alembic；前端 React + TS。
- 生成必须**确定性可测**：同输入同输出（LLM 路径仅增量注记且需过校验）。
- 输入为空/残缺时必须降级出有效文档（现有 `eplan_xml.py` / `_build_fallback_topology` 同款防御性）。
- schema 变更必须走 Alembic 迁移（禁 `create_all` 上线）。

**软约束**

- 复用 `wiring_generator` / `plc_catalog` / `component_normalizer` 的既有映射，不建平行体系。
- 符号几何定义放后端单源（Python），前端拓扑画布符号资产不强制同步迁移。

## 4. 架构

### 4.1 数据流

```
                       ┌─────────────────────────────────────────────┐
                       │  已确认拓扑 (project_topologies.snapshot)     │
                       │  BOM (bom_items)  需求(requirements+io_list)  │
                       │  接线表 (wiring_generator 行数据, 派生)        │
                       └──────────────────┬──────────────────────────┘
                                          ▼
                          schematic_builder.py（确定性核心）
                          ┌─ power_circuit.py    主回路模板
                          ├─ control_circuit.py  控制回路模板（梯形图 rung 模型）
                          ├─ io_circuit.py       端子/IO 回路页
                          └─ netlist.py          等电位归并 → 线号 → 交叉引用
                                          ▼
                              Schematic IR (Pydantic, ir_version=1)
                                          ▼  validate_schematic_ir()
                          ┌───────────────┬─────────────────────┐
                          ▼               ▼                     ▼
                   schematic_svg.py   LLM 评审节点            api/schematic_v2.py
                   (ElementTree       (schematic_reviewer:    (存 schematic_pages 表,
                    渲染多页 SVG)       只注记,不过连通性)        GET 分页 / 触发派生)
                          ▼                                       ▼
                   ZIP 导出包                                  SchematicPanel.tsx
                   (ReportExporter)                            (分页查看/缩放/联动BOM)
```

### 4.2 组件职责表

| 组件 | 位置 | 一句话职责 |
|---|---|---|
| IR 模型 | `backend/app/core/schematic/ir.py` | SchematicDocument/Page/SymbolInstance/Pin/Wire/Annotation 的 Pydantic v2 模型 + `validate_schematic_ir()` |
| 符号库 | `backend/app/core/schematic/symbols.py` | IEC 60617 符号的参数化几何（SVG path 模板 + 引脚锚点），单一真相源 |
| 主回路生成器 | `backend/app/core/schematic/power_circuit.py` | 拓扑中 power→protection→execution 链 → 三相母线+垂直支路 IR |
| 控制回路生成器 | `backend/app/core/schematic/control_circuit.py` | 控制变压器/安全链/线圈联锁 → 梯形 rung IR；线号=行号 |
| IO 回路生成器 | `backend/app/core/schematic/io_circuit.py` | wiring 行 → 现场设备-端子X1-PLC通道 页 |
| 网表引擎 | `backend/app/core/schematic/netlist.py` | 引脚连通性 → 等电位类（并查集）→ 线号分配 + 触点/线圈交叉引用 |
| SVG 渲染器 | `backend/app/core/schematic/svg_render.py` | IR → 每页独立 SVG（图框/标题栏/分区栅格/线束折点正交布线） |
| 编排入口 | `backend/app/core/schematic/builder.py` | `build_schematic(topology, bom, requirement, wiring_rows) -> SchematicDocument`，调上面四个生成器并全局校验 |
| API | `backend/app/api/schematic_v2.py` | 生成/读取/重生成端点 + topolog confirm 派生钩子 |
| LLM 评审 | `agents.py` 新节点 `schematic_reviewer`（P3） | 对 IR 提修改建议（如缺联锁），建议过校验才落库 |
| 前端面板 | `frontend/src/views/components/SchematicPanel.tsx` | 分页 SVG 查看器（缩放/平移/符号点击联动 BOM） |

**为什么 netlist 独立成组件**：线号、交叉引用、后续 EPlan 导出、以及"回路连续性"校验（每个线圈有回路路径、不同电位不短接）全部依赖网表；把连通性计算与几何布局解耦，几何永远可以从网表重排。

**为什么符号库在后端**：SVG 在服务端渲染（导出 ZIP 不依赖浏览器），符号几何若放前端会出现两套真相。前端拓扑画布的 9 个 SVG 资产保留现状，不强求统一（软约束）。

### 4.3 Schematic IR 模型（契约）

```python
# backend/app/core/schematic/ir.py  (Pydantic v2)
class PinRef(BaseModel):
    symbol_id: str          # "sym_012"
    pin: str                # "A1" / "L1" / "13" / "14" ...

class SymbolInstance(BaseModel):
    id: str
    ref: str                # IEC 81346 设备标签 "-Q1"（沿用 eplan_xml._tag_prefix 规则）
    symbol_key: str         # "QF_3P" / "KM_MAIN_3P" / "KM_COIL" / "SB_MUSHROOM_NC" ...
    pos: tuple[float, float]  # 图幅栅格坐标（mm，A3=420x297）
    mirror: bool = False
    attrs: dict[str, str] = {}  # manufacturer/model/specifications → 标签旁注记
    bom_link: str | None = None  # 关联 bom_items id（联动 BOMPanel 高亮）

class Wire(BaseModel):
    id: str
    net: str                # 电气节点 id "N17"
    points: list[tuple[float, float]]  # 正交折线（经符号引脚锚点）
    line_no: str | None = None         # 线号（netlist 阶段回填，控制回路必填）

class CrossRef(BaseModel):
    kind: str               # "coil" | "contact" | "terminal"
    ref: str                # "-K1"
    pages: list[str]        # 出现页号（线圈页+各触点页）

class SchematicPage(BaseModel):
    page_no: int
    kind: str               # "power" | "control" | "io" | "safety" | "title"
    title_zh: str           # 标题栏用
    symbols: list[SymbolInstance]
    wires: list[Wire]
    cross_refs: list[CrossRef] = []
    notes: list[str] = []   # 生成器提示（"未在拓扑中找到电机，主回路省略"）

class SchematicDocument(BaseModel):
    ir_version: int = 1
    project_id: str
    source_topology_version: int   # 溯源：派生自哪个已确认拓扑版本
    standard: str = "IEC 60617 / GB/T 4728"
    pages: list[SchematicPage]

def validate_schematic_ir(doc: SchematicDocument) -> tuple[bool, str]:
    """结构校验（镜像 validate_eplan_xml 范式）：
    1. 每页 page_no 唯一且递增；2. wire 端点必须吸附到某符号引脚锚点；
    3. 同一 net 的线必须连通（图上可达）；4. 控制回路每 net 有 line_no；
    5. 每个 symbol_id 被引用前已定义。"""
```

IR 的 JSON 序列化即存储格式（`schematic_pages.ir`），版本化 `ir_version` 为后续演进留余地——**接口先于实现，IR 变更即架构变更**。

### 4.4 电路模板规则（确定性核心）

**主回路页（power）**——横向三相母线在页顶（L1/L2/L3 + N + PE，从左到右分区 1-8）：

```
拓扑链路（category=power 边）: power|transformer → circuit_breaker|disconnect|fuse → contactor|vfd|servo → motor
每条 execution 支路 = 一次垂直下落: 母线 → [QF] → [KM 主触点] → [电机圆圈 M 3~]
VFD/Servo 支路: 母线 → QF → (VFD 方框) → 电机，框内标注 U/V/W
无电机的 contactor：只出主触点符号，notes 提示"执行器未指定"
```

**控制回路页（control）**——梯形图模型，左右母线（L+ / M 或 1L / 2N）：

```
rung = 串联触点链 → 线圈/指示灯
rung 生成源（按优先级）:
  1. requirement.logic_rules 文本 → P3 由 LLM 翻译成 rung 草案（过校验）
  2. 规则模板: 每个接触器 KMx = [急停链常闭]·[安全继电器触点]·[KMx 线圈] + 自锁触点
              每个信号灯 Hx = [KMy 常开]·[Hx]
安全链 (safety_level>=SIL2): 双通道急停 + 安全继电器 KF 占 rung 1-2，
  输出触点进每个 KM rung —— 与 rule_engine.check_sil_redundancy 同一判定源
线号 = rung 序号 (IEC 惯例: 左母线起 1,2,3...)
```

**IO 页（io）**——每个 wiring 行 `{tag, signal, from, to, wire}` → 一行图形：现场符号（按 io 类型选按钮/传感器/指示灯）— 线号 — 端子 X1.n — 电缆虚线 — PLC 通道框；`over=true` 行加红色 EXT 标记。导线截面/颜色直接取 `wire` 字段，与 WiringPanel 完全一致。

### 4.5 符号库首版（~25 个，IEC 60617 / GB/T 4728）

| symbol_key | 符号 | 覆盖拓扑 type / BOM category |
|---|---|---|
| QF_1P/3P | 断路器 | circuit_breaker / CIRCUIT_BREAKER |
| QS_3P | 隔离开关 | disconnect |
| FU | 熔断器 | fuse / FUSE |
| KM_MAIN_3P, KM_NO, KM_NC, KM_COIL | 接触器主触点/常开/常闭/线圈 | contactor / CONTACTOR |
| KA_COIL, KA_NO, KA_NC | 继电器 | relay / safety_relay 的通道触点 |
| KF_SAFETY | 安全继电器方框（含通道触点对） | safety_relay |
| M_3PH | 三相电机 | motor |
| T_CTRL | 控制变压器 | transformer |
| PSU | 开关电源方框 | power / POWER_SUPPLY |
| SB_MUSHROOM_NC | 急停按钮（蘑菇头常闭×2 串联画法） | estop |
| SG_DOOR_NC | 安全门开关 | safety_door |
| SB_NO/NC, SL | 按钮指示灯 | switch / sensor / signal_light |
| SQ_PROX | 接近/传感器 | sensor |
| X_TERMINAL | 端子 | （接线表 X1.*） |
| PLC_IO_BOX, VFD_BOX, SERVO_BOX | 功能框 | plc/io/vfd/servo |

符号 = 参数化几何（path 模板 + 引脚锚点表 + 默认标签偏移），存 Python 常量；**不认识的类型 → 功能框 + 虚线引脚 + notes 警告**，绝不静默丢设备。

### 4.6 API / DB / 前端变更

**DB（迁移 011）**：

```python
class SchematicPageRow(Base):
    __tablename__ = "schematic_pages"
    id            # uuid pk
    project_id    # FK projects.id, 与 page_no 建联合唯一
    page_no: int
    kind: str           # power/control/io/safety/title
    ir: JSON            # SchematicPage 模型序列化
    svg: Text           # 渲染结果缓存（ir 变更时重渲染）
    created_at
```

旧 `schematics` 表（mermaid 框图）保留不动，v1 端点不破坏。

**API（`api/schematic_v2.py`）**：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/projects/{id}/schematic/pages` | 从最新 confirmed 拓扑+BOM 重派生（幂等：删旧页重建） |
| GET | `/api/projects/{id}/schematic/pages` | 页列表（page_no/kind/title + svg） |
| GET | `/api/projects/{id}/schematic/pages/{no}` | 单页详情（ir + svg） |
| 钩子 | `topology/confirm` | 现状：confirm 仅置 status（`api/topology.py:56`），**不触发任何派生**；P1 在 confirm 内追加 schematic 派生调用（后台任务，不阻塞响应） |

**LangGraph**：`AnalysisState` 增加 `schematic_pages: list[dict] | None`；P1-P2 阶段在 `schematic_generator` 节点后新增 `schematic_ir_builder` 节点（确定性，无 LLM 调用，纯本地计算，不增加 wall-clock 风险）；P3 增加 `schematic_reviewer`。

**前端**：
- `SchematicPanel.tsx`：页签（主回路/控制回路/IO）+ SVG pan/zoom + 符号点击 → `bom_link` 联动 BOMPanel 高亮；加入 AppLayout 画布视图切换。
- `ReportExporter`：ZIP 追加 `schematics/page-XX.svg`（零依赖，P1 即可）；PDF 转换为可选项后置。
- `services/schematic.ts`：新 API 客户端（MVS Service 层）。

## 5. 失效模式表

| 组件 | 挂了什么样 | 怎么发现 | 怎么恢复 |
|---|---|---|---|
| power_circuit | 拓扑无 execution 设备 → 主回路页空 | `notes` 写入"拓扑中未发现执行设备" | 页面跳过，不出空页；前端显示提示徽章 |
| control_circuit | 无接触器/无安全级 → 控制页仅剩电源 rung | 同上 notes + lint | rung 0 兜底（变压器+熔断器+指示） |
| symbols | 未知设备类型 | 未知 type → 功能框 + notes 警告 | 前端仍可显示；符号库补齐即消 |
| netlist | 线号冲突 / wire 断链 | `validate_schematic_ir` 返回 (False, reason) | 端点 422 + reason；生成器内保守重排后重试一次 |
| svg_render | 符号越出图幅 | 页面符号数超阈值（>40）分页 | 自动折页（主回路每页 ≤6 支路，控制回路每页 ≤15 rung） |
| LLM reviewer (P3) | 建议非法/超时 | 校验失败/异常捕获 | 丢弃建议，确定性 IR 原样落库（log warning） |
| 派生钩子 | confirm 时拓扑缺 nodes | 沿用 topology API 既有 400 | 用户重生成拓扑 |

## 6. 验证计划

- **TDD 单元**（`backend/tests/schematic/`）：
  - `test_ir_validation.py`：合法/断链/缺线号/重复页号。
  - `test_power_circuit.py`：3 个标准夹具——单变频输送线 / 3 电机启动器柜 / 带安全门安全链；断言支路顺序、符号数、net 数。
  - `test_control_circuit.py`：SIL2 夹具断言急停双通道 + KF 触点进每个 KM rung + 自锁存在。
  - `test_netlist.py`：等电位归并正确性（并联触点同 net）、线号唯一、交叉引用表与符号出现页一致。
  - `test_svg_render.py`：golden snapshot（确定性渲染，SVG 字节级比对）。
  - `test_api_schematic_v2.py`：SQLite + 内联 app，幂等重派生、422 路径。
- **架构假设验证**：用 1 个真实历史项目拓扑跑端到端，人工评审渲染页（验收标准：电气工程师能看懂并指出 <3 处规范错误/页）。
- **防漂移**：`test_alembic_schema_sync.py` 自动覆盖 011 迁移。

## 7. 分阶段实施计划

| 阶段 | 内容 | 交付物 | 预估 |
|---|---|---|---|
| **P0 契约** | IR 模型 + 校验器 + 符号库骨架（8 个核心符号） | `ir.py`/`symbols.py` + 测试 | 1-2 天 |
| **P1 主控回路 MVP** | power/control 生成器 + netlist（线号）+ SVG 渲染 + 011 迁移 + API + SchematicPanel + ZIP 收录 | 用户可见的 2 页原理图 | 3-5 天 |
| **P2 IO 页与交叉引用** | io_circuit + 交叉引用表 + 折页 + 剩余 ~17 符号 + `schematic_ir_builder` 入 graph | 全页型 + 完整线号 | 2-3 天 |
| **P3 LLM 评审** | `schematic_reviewer` 节点 + logic_rules→rung 翻译（校验门） | 缺失联锁建议、逻辑规则上图 | 1-2 天 |
| **P4 EPlan P8 导出** | IR→官方 XML（页/符号放置/连接）或 DXF | EPlan P8 可导入文件 | 单独立项，1-2 周+ |

每阶段结束跑全量 `pytest + npm test`；P1 起进入 ReportExporter 导出包。

## 8. 开放问题

1. **图幅规格**：A3 横放（工程惯例）还是 A4？首版建议 A3，分区 8×6。→ P1 定。
2. **标题栏字段**：项目名/页号/版本/日期/设计-审核-批准签名栏留空？需要组织偏好（org_preferences 可配）？→ P1 定。
3. **线号规则**：纯 rung 序号 vs 电位分段编号（L+侧 1..n，N 侧统一 0）？中国柜厂习惯后者居多。→ P1 用电位分段。
4. **control 回路的 logic_rules 利用深度**：P3 只翻译简单时序（启保停/联锁）还是支持复杂时序？建议先只做"启保停 + 联锁 + 指示"三类模板。
5. **PDF 导出**：SVG 直收 ZIP 是否满足交付？若客户要 PDF，评估 `cairosvg`（纯 Python，依赖 cairo 动态库，Windows 容器内需额外层）。
6. **符号几何与前端拓扑画布是否统一**：后端符号库成形后，前端 `assets/symbols/*.svg` 是否改为从后端导出（构建期同步），避免双源漂移？建议 P2 后再议。

## 9. 取舍记录

- **确定性优先于 LLM 生成整图**：LLM 画整页原理图不可控（现有 mermaid 路径已证明），本设计让 LLM 只做评审/翻译文本规则，连通性永远由模板+网表保证——与 `code_generator` 确定性兜底范式的决策一致。
- **IR 存 JSON 而非关系表**：原理图是派生物（可随时从拓扑重派生），不值得 6 张关系表；JSON + 版本号换取演进灵活性，代价是不能 SQL 查询符号级数据（无此需求）。
- **服务端渲染 SVG 而非前端绘制**：导出 ZIP 必须离线可用；代价是交互性弱于 Canvas（用 pan/zoom + 点击热点弥补）。
- **新表 `schematic_pages` 而非扩展 `schematics`**：旧表 1:1 且承载 v1 mermaid；混用会污染兼容语义，迁移成本（1 张新表）可接受。
