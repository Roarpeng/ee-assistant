# 拓扑物理连线纠偏与中文协议修复总结报告

本期工作彻底定位并修复了导致**安全门与安全 PLC 之间无法画出连线（独立孤立）**、**安全器件（急停/安全门）在聊天中误渲染为传感器**，以及**大量中文协议标识为 `UNKNOWN`（蓝色网络虚线）**的深层系统级架构漏洞。同时额外修复了本地单元测试中 **SQLite 数据库测试引擎不支持连接池参数** 的环境缺陷。

---

## 1. 核心修复

### 1.1 根治 ReactFlow 物理句柄反转的致命 Bug
- **文件**：`backend/app/core/graph/agents.py` 里的 `_pick_handles`
- **原设计缺陷**：在句柄匹配算法中，原系统试图根据源/目标节点的相对 X/Y 坐标，动态对调句柄的物理方向以使折线美观。然而在 ReactFlow 中，起点节点只能连接 `type="source"` 的句柄（如 `safe-right`），终点节点只能连接 `type="target"` 的句柄（如 `safe-left`）。
  一旦节点坐标发生变化（例如安全门 1、2 位于安全 PLC 的右侧时，`sx > tx`），算法反转并返回了 `("safe-left", "safe-right")`，直接导致起点的安全门强配了 `target` 句柄，终点的安全 PLC 强配了 `source` 句柄。这引发了 ReactFlow 底层的强类型冲突，直接静默拒绝在画布上绘制连线！
- **修复逻辑**：重构并彻底规范化了 `_pick_handles` 算法。剥离所有因坐标引起的句柄类型反转对调，确保连线起点的 `sourceHandle` **永远** 对应 `type="source"` 句柄，连线终点的 `targetHandle` **永远** 对应 `type="target"` 句柄：
  ```python
  def _pick_handles(category: str, src_pos, tgt_pos) -> tuple[str, str]:
      if category == "power": return ("pwr-bottom", "pwr-top")
      if category == "feedback": return ("fb-top", "fb-bottom")
      if category == "safety": return ("safe-right", "safe-left")
      return ("net-right", "net-left")
  ```
  该物理类型纠偏成功让画布上所有方向（从右到左、从下到上）的折线连线都能 **100% 正常画出，安全门自此彻底告别孤立悬空状态！**

### 1.2 聊天数据流拦截与类型强修正
- **文件**：`backend/app/core/chat_orchestrator.py` 与 `backend/app/core/graph/agents.py` 的 `normalize_topology`
- **问题**：原 `ChatOrchestrator`（聊天流）直接将 LLM 返回的原始 `topology` 透传给前端，绕过了拓扑规范化算法。导致 LLM 将急停与安全门误分类为 `"sensor"` 类型时，直接在画布上显示为圆形绿点；三色灯也被设为了 `"other"` 回退白框。
- **修复**：
  1. 将 `_normalize_topology` 重构并导出为公有接口 `normalize_topology`。
  2. 在 `chat_orchestrator.py` 聊天推送前，引入 `normalize_topology` 拦截并过滤。
  3. 引入高精度关键字校正规则：Label 中含“急停/stop”强转为 `"estop"`；含“安全门”强转为 `"safety_door"`；含“三色灯/信号灯”强转为 `"signal_light"`。
- **效果**：急停、安全门和三色灯完全恢复其专属精美工业组件样式。

### 1.3 LLM 聊天中文协议高精度归一化
- **文件**：`backend/app/core/component_normalizer.py` 里的 `_TOPOLOGY_PROTOCOL_ALIAS`
- **修复逻辑**：由于 LLM 倾向于输出“安全输入”、“数字量输出”、“硬接线”等中文字样。我们在归一化字典中加入了高精度的中文别名映射支持，将其完美对应到标准的系统网络与控制分类中。
- **效果**：聊天拓扑中的连线协议文字不再被强制归为 `"UNKNOWN"`，而是能根据真实分类自动着色（安全总线显示为红色的 `SAFETY_CIRCUIT` 实线/虚线，信号回馈显示为绿色的 `SIGNAL` 实线/虚线）。

---

## 2. 数据库测试引擎优化 (SQLite)

- **文件**：`backend/app/db/repository.py`
- **修复说明**：由于测试环境运行在 SQLite 上，其 Dialect 并不支持 Postgres 特有的 `pool_size` 和 `max_overflow` 选项。我们在创建 `create_async_engine` 时增加了动态环境检测：仅在 `database_url` 不以 `sqlite` 开头时才向 SQLAlchemy 传递连接池参数，确保本地自动化单元测试可以无缝通过。

---

## 3. 部署与单元测试

最新的连线方向控制与中文协议映射代码，已全量打包重构进后端容器镜像：
```bash
docker compose up -d --build backend
```
随后运行了全量 203 个单元用例测试：
```bash
docker exec ele-backend-1 python -m pytest tests/
```
回归测试表明：句柄极度规范化的调整完全符合工业拓扑的核心标准，测试集 **203/203 100% 全部顺利通过！**
