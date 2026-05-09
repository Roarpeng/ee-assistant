# 知识库 Bundle — 跨部署点共享与复用

把已建好的知识库（向量、图谱、PDF）打包成一个 tarball，分发到其它部署点直接 import，避免重复花 **embedding API + LLM 实体抽取** 费用。

> **核心收益**：300MB 产品手册的 embedding+图谱抽取成本可达数十至数百美元，每次部署省下来 = 直接收益。

---

## 何时用

| 场景 | 是否合适 |
|---|---|
| 一份知识库要部署到多台机器 / 多个客户环境 | ✅ |
| 主机重装系统，想保留花过 token 的成果 | ✅ |
| 切换 embedding model 或维度（4096 → 1024） | ❌ 必须重新 ingest |
| 需要实时多机同步 | ❌ 这是离线 snapshot，不是复制 |
| 想 git 进主仓库 | ❌ 体积太大（GB 级），用 Releases assets |

---

## Bundle 内容

单个 `.tgz` 包含：

```
knowledge-bundle-<UTC-timestamp>.tgz
├── manifest.json              # 元信息 + 计数（embed model/dim、git_sha、stats）
├── qdrant/
│   └── <collection>.snapshot  # Qdrant 原生 snapshot（保留索引/量化）
├── postgres/
│   └── knowledge.sql          # 仅 4 张表的 pg_dump
└── minio/
    └── <bucket>/              # 原始 PDF（doc-uuid 命名）
```

体积估算：300MB 原始 PDF + 等量级向量数据 + 图谱 ~10MB ≈ **2-3GB tarball**。

---

## 1. 在源端打包

前置：`docker compose up -d` 全部容器在跑、知识库已有数据。

### Linux / macOS / git-bash on Windows

```bash
chmod +x scripts/backup_knowledge.sh
./scripts/backup_knowledge.sh
# 输出: ./bundles/knowledge-bundle-20260509-135100.tgz (1.8G)
```

### 原生 Windows PowerShell

```powershell
.\scripts\backup_knowledge.ps1
# 输出: .\bundles\knowledge-bundle-20260509-135100.tgz (1.8G)
```

可选指定输出目录：`--output-dir` (bash) / `-OutputDir` (ps1)。

---

## 2. 分发

任选一种渠道（脚本不绑死任何渠道，都是普通 tarball）：

| 渠道 | 适合场景 | 一行命令 |
|---|---|---|
| **GitHub / Gitea Releases attach asset** | 公开内容、PDF 可分享 | `gh release upload v1.2.0 bundles/knowledge-bundle-*.tgz` |
| **私有 GitLab / Gitea Releases** | PDF 涉密但内网可达 | 网页上传 / `glab release upload ...` |
| **MinIO / S3 / OSS bucket** | 已有对象存储基建 | `mc cp bundles/*.tgz prod/kb-bundles/` |
| **SCP / rsync / U 盘** | 一次性、信任域内 | `scp bundles/*.tgz user@target:~/` |

> ⚠️ Bundle 包含原始 PDF。**公开发布前确认产品手册的版权许可。**

---

## 3. 在目标端还原

前置：目标机已 `docker compose up -d` + `alembic upgrade head`，schema 就位（数据可空）。

### Linux / macOS / git-bash

```bash
# 拉 bundle
wget <your-release-url>/knowledge-bundle-20260509-135100.tgz

# 还原（破坏性！会清空目标的 4 张知识库表 + bucket）
chmod +x scripts/restore_knowledge.sh
./scripts/restore_knowledge.sh knowledge-bundle-20260509-135100.tgz
```

### 原生 Windows PowerShell

```powershell
# 拉 bundle
Invoke-WebRequest <your-release-url>/knowledge-bundle-20260509-135100.tgz `
    -OutFile knowledge-bundle-20260509-135100.tgz

# 还原
.\scripts\restore_knowledge.ps1 -Bundle knowledge-bundle-20260509-135100.tgz
```

### Embed 配置不匹配怎么办

脚本默认会比对 bundle 中的 `embed_model` / `embed_dim` 与目标机的 `.env`：

- **匹配**：直接 import，搜索结果完全等价
- **不匹配**：脚本中止并打印两边的实际值

如果你**确定**要强制 import（例如目标机改了 .env 但还没同步），加 `--force` (bash) / `-Force` (ps1)。注意：维度不一致会导致 Qdrant 写入失败或检索结果错乱。

---

## 4. 验证

还原后到 UI 看：

1. 知识库面板列出 N 条文档，状态全部 `ready`
2. 任意搜索一句之前知道能命中的内容，应能召回到 chunk
3. 选型流程触发图遍历能拿到 component edges

也可在命令行核对：

```bash
docker exec ee-assistant-postgres-1 psql -U ele -d ele -c \
    "SELECT count(*) FROM knowledge_docs;"
docker exec ee-assistant-backend-1 curl -s \
    http://qdrant:6333/collections/ee_knowledge | grep points_count
```

数字应等于 bundle 的 `manifest.json` → `stats`。

---

## 工作机制简述

| 步骤 | 实现 |
|---|---|
| Qdrant 数据 | 调原生 snapshot API → 复制 binary snapshot 文件 → restore 端 PUT recover |
| Postgres 数据 | `pg_dump` 仅 4 张表 → restore 时先 `TRUNCATE ... CASCADE` 再 `psql -i` |
| MinIO 数据 | `docker cp /data/<bucket>` 整目录搬运 |
| Manifest gate | restore 前比对 embed_model + embed_dim，错配中止保护用户 |

源代码：`scripts/backup_knowledge.{sh,ps1}` + `scripts/restore_knowledge.{sh,ps1}`
设计文档：`docs/superpowers/specs/2026-05-09-knowledge-bundle-export-import-design.md`

---

## 常见问题

**Q：Bundle 太大，能瘦身吗？**
A：可以——把 `minio/` 子树从 tar 命令排除即可（修改 backup 脚本），但代价是日后换 embedding model 必须重新收 PDF。

**Q：能增量更新吗？**
A：不能。Snapshot 是全量。增量需要一套对账机制（比对两边的 `knowledge_docs.id`），此版本不实现。

**Q：能在主仓库跟踪 bundle 历史吗？**
A：用 GitHub Releases 加版本号 tag（如 `kb-v1`、`kb-v2`），能拿到时间序列；不要 git LFS（GitHub 月 1GB 免费，几次 push 就超）。

**Q：postgres 卷一起备份不就行？**
A：会把项目数据 / BOM / 用户 topology 全部带过去。本方案故意只搬 4 张知识库表，让目标机的项目数据保持独立。
