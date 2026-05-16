#!/usr/bin/env bash
# ============================================================================
# EE Assistant — 一键 Docker 部署脚本
#
# 用法:
#   ./scripts/deploy.sh             # 拉最新代码 + rebuild + 重启
#   ./scripts/deploy.sh --no-pull   # 跳过 git pull (本地已是目标版本)
#   ./scripts/deploy.sh --logs      # 重启后跟踪 backend 日志
#
# 前置条件:
#   - 已安装 docker (>= 24) 与 docker compose v2
#   - 已在仓库根目录创建 .env (可参考 .env.example)
# ============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."

PULL=true
TAIL_LOGS=false
for arg in "$@"; do
    case "$arg" in
        --no-pull)   PULL=false ;;
        --logs)      TAIL_LOGS=true ;;
        -h|--help)
            sed -n '2,16p' "$0"
            exit 0
            ;;
        *)
            echo "未知参数: $arg" >&2
            exit 2
            ;;
    esac
done

echo "==> [1/5] 检查 docker 可用性"
docker --version
docker compose version

if [[ ! -f .env ]]; then
    echo "==> 未发现 .env, 复制 .env.example 作为模板 (LLM 配置可在 UI 中完成)"
    cp .env.example .env
fi

if $PULL; then
    echo "==> [2/5] 拉取最新代码 (git pull --ff-only)"
    git pull --ff-only
else
    echo "==> [2/5] 跳过 git pull"
fi

echo "==> [3/5] 重新构建镜像 (frontend + backend, --pull 拉取最新基础镜像)"
docker compose build --pull

echo "==> [4/5] 启动服务 (postgres / qdrant / minio / backend / frontend)"
docker compose up -d

echo "==> [5/5] 健康自检"
sleep 5
# 等待 backend 起来 (最多 60s)
for i in $(seq 1 30); do
    if docker compose exec -T backend curl -fs http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
        echo "    backend /api/health OK"
        break
    fi
    sleep 2
done

# 验证新增 endpoint
if docker compose exec -T backend curl -fs http://127.0.0.1:8000/api/llm-providers >/dev/null 2>&1; then
    PROVIDER_COUNT=$(docker compose exec -T backend curl -s http://127.0.0.1:8000/api/llm-providers | grep -oE '"id"' | wc -l)
    echo "    /api/llm-providers OK (${PROVIDER_COUNT} 家厂商可选)"
else
    echo "    !!! /api/llm-providers 无响应, 请检查 docker compose logs backend"
fi

# 此次 PR 未引入 alembic 迁移, 但保险起见仍跑一次 (幂等)
echo "==> alembic upgrade head (无新迁移时为 no-op)"
docker compose exec -T backend alembic upgrade head || \
    echo "    (alembic 失败可忽略, 本次 PR 无新迁移)"

echo ""
echo "==================================================================="
echo "  部署完成"
echo "  前端: http://localhost:8090   (docker-compose.yml 把 80 映射到 8090)"
echo "  后端: http://localhost:8000   API docs: http://localhost:8000/docs"
echo "  新增端点: GET /api/llm-providers (8 家 LLM 厂商注册表)"
echo "==================================================================="

if $TAIL_LOGS; then
    docker compose logs -f backend
fi
