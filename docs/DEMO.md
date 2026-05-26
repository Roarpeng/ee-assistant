# Volta — 5 分钟演示 / 5-Minute Demo

## 中文

### 前置条件

- Docker Desktop（或 Linux Docker + Compose）
- 一组 **OpenAI 兼容** API：Chat 模型 + Embedding 模型（DeepSeek、百炼、SiliconFlow、OpenAI 等均可）

### 步骤

| # | 操作 | 预期结果 |
|---|------|----------|
| 1 | `docker compose up -d --build` 并 `alembic upgrade head` | 前端可访问，健康检查 `/api/health` 正常 |
| 2 | 打开应用 → **设置** → 填写 Chat / Embedding → **测试连通性** | 两项均成功 |
| 3 | 对话区点击 **完整工程生成** | LangGraph SSE 进度；画布出现拓扑、BOM |
| 4 | 切换到 **拓扑图** | ReactFlow 可拖拽节点 |
| 5 | **原理图 · ST** → **ST 代码** 子标签 | Monaco 显示 SCL；可下载 |
| 6 | **知识库** → **语义** 检索 | 输入「PLC CPU」等，返回向量片段 |
| 7 | **概览** → **导出工程包** | 下载 `*-volta-export.zip` |

### 演示用例（可复制到对话框）

```
设计一条带 3 台电机、急停按钮和互锁逻辑的输送线控制系统，PLC 使用西门子 S7-1200，现场总线 PROFINET。
```

### 可选：预置知识库

若有同事导出的 bundle：

```bash
./scripts/restore_knowledge.sh path/to/knowledge-bundle-YYYYMMDD.tgz
```

---

## English

### Prerequisites

- Docker Compose
- OpenAI-compatible **Chat** + **Embedding** endpoints

### Steps

1. Start stack: `docker compose up -d --build` + migrations  
2. **Settings** → configure APIs → connectivity test  
3. Click **Full engineering run** in chat  
4. Edit **Topology**, inspect **BOM / Wiring / Diagram · ST**  
5. **Overview** → **Export package** (ZIP)  
6. **Knowledge** → **Semantic** search against your corpus  

### Sample prompt

```
Design a conveyor control system with 3 motors, E-stop, and interlock logic. Use Siemens S7-1200 and PROFINET.
```
