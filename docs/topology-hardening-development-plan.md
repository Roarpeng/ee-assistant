# Topology Hardening 开发文档（P0 执行版）

## 目标

修复“电气元件理解不足导致拓扑错误”的核心链路，聚焦 P0：

1. 元件类型与协议归一化（alias → canonical）
2. 实体抽取 schema 增强（电压/信号/安全等结构化字段）
3. 拓扑 lint 校验（主供电链、孤立边、协议完整性）

## 范围

- backend/app/core/component_taxonomy.py（新增）
- backend/app/core/component_normalizer.py（新增）
- backend/app/core/entity_extractor.py（增强）
- backend/app/core/topology_lint.py（新增）
- backend/app/core/graph/agents.py（接入 lint + canonical）
- backend/tests/test_component_normalizer.py（新增）
- backend/tests/test_topology_lint.py（新增）

## 详细任务

### 任务 1：类型归一化层

- 维护组件类型 canonical 集合
- 维护协议 canonical 集合
- alias 字典支持中英文与常见简称
- 提供 normalize_component / normalize_protocol / normalize_property_map

### 任务 2：实体抽取强化

- Prompt 明确要求输出结构化 properties：
  - voltage_level
  - signal_type
  - io_direction
  - network_protocol
  - safety_class
- 对 LLM 返回结果做 normalize_component

### 任务 3：拓扑 lint

规则：

1. 节点 ID 唯一且非空
2. 边 source/target 必须存在
3. protocol 不能为空
4. 主供电链最小要求：存在 power_supply 与 plc_cpu（允许别名）

### 任务 4：编排接入

- `_normalize_node` 中 canonical type
- `_normalize_edge` 中 canonical protocol
- `_normalize_topology` 末尾执行 lint：
  - warning 保留
  - error 写入 metadata，供上层决策

## 测试策略

- normalizer 单测：别名转换与属性规整
- topology_lint 单测：
  - 正常链路通过
  - dangling edge 报错
  - 缺少供电链报 warning/error

## 风险

- 旧数据 type 命名不一致，可能被统一后影响前端样式映射。
- 需保证 canonical 映射后仍兼容已有 ReactFlow node 类型。

## 回滚

- 通过 git revert 单次提交回滚。
- 新增文件均为旁路增强，不影响 DB schema。
