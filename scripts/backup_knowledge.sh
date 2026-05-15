#!/usr/bin/env bash
# Build a portable knowledge bundle from the running compose stack.
#
# Output: ./bundles/knowledge-bundle-YYYYMMDD-HHMMSS.tgz
# Layout:
#   manifest.json
#   qdrant/<collection>.snapshot
#   postgres/knowledge.sql
#   minio/<bucket>/<...>
#
# Requirements on host: docker, tar (gzip), bash. No jq, no python on host —
# all heavy work runs inside containers via `docker exec`.
#
# Usage:
#   ./scripts/backup_knowledge.sh
#   ./scripts/backup_knowledge.sh --output-dir ./somewhere

set -euo pipefail

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ee-assistant}"
BACKEND="${PROJECT_NAME}-backend-1"
POSTGRES="${PROJECT_NAME}-postgres-1"
QDRANT="${PROJECT_NAME}-qdrant-1"
MINIO="${PROJECT_NAME}-minio-1"

OUTPUT_DIR="./bundles"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,15p' "$0"; exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

# ── 0. Pre-flight ─────────────────────────────────────────────────────────
echo "==> Pre-flight checks"
for c in "$BACKEND" "$POSTGRES" "$QDRANT" "$MINIO"; do
    if ! docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null | grep -qx true; then
        echo "ERROR: container '$c' is not running. Run 'docker compose up -d' first." >&2
        exit 1
    fi
done

mkdir -p "$OUTPUT_DIR"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
STAGE="$(mktemp -d -t kbundle.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT
echo "    staging dir: $STAGE"

# ── 1. Read settings from running backend so manifest matches reality ────
echo "==> Reading backend settings"
SETTINGS_JSON="$(docker exec "$BACKEND" python -c '
import json
from app.config import settings
print(json.dumps({
    "qdrant_collection": settings.qdrant_collection,
    "minio_bucket": settings.minio_bucket,
    "embed_model": settings.effective_embed_model(),
    "embed_dim": settings.embedding_dim,
}))
')"
QCOLL="$(echo "$SETTINGS_JSON" | sed -n 's/.*"qdrant_collection": *"\([^"]*\)".*/\1/p')"
MBUCKET="$(echo "$SETTINGS_JSON" | sed -n 's/.*"minio_bucket": *"\([^"]*\)".*/\1/p')"
EMBED_MODEL="$(echo "$SETTINGS_JSON" | sed -n 's/.*"embed_model": *"\([^"]*\)".*/\1/p')"
EMBED_DIM="$(echo "$SETTINGS_JSON" | sed -n 's/.*"embed_dim": *\([0-9]*\).*/\1/p')"
echo "    collection=$QCOLL bucket=$MBUCKET model=$EMBED_MODEL dim=$EMBED_DIM"

# ── 2. Qdrant snapshot ───────────────────────────────────────────────────
echo "==> Creating Qdrant snapshot for collection '$QCOLL'"
mkdir -p "$STAGE/qdrant"
QDRANT_PT_COUNT=0
SNAPSHOT_RAW="$(docker exec "$BACKEND" curl -s -X POST \
    "http://qdrant:6333/collections/$QCOLL/snapshots" || true)"
if echo "$SNAPSHOT_RAW" | grep -q '"name"'; then
    SNAP_NAME="$(echo "$SNAPSHOT_RAW" | sed -n 's/.*"name" *: *"\([^"]*\)".*/\1/p' | head -n1)"
    echo "    snapshot file: $SNAP_NAME"
    docker cp "$QDRANT:/qdrant/snapshots/$QCOLL/$SNAP_NAME" \
        "$STAGE/qdrant/$QCOLL.snapshot"
    # Best-effort cleanup of the snapshot inside qdrant container
    docker exec "$BACKEND" curl -s -X DELETE \
        "http://qdrant:6333/collections/$QCOLL/snapshots/$SNAP_NAME" >/dev/null 2>&1 || true

    POINTS_RAW="$(docker exec "$BACKEND" curl -s "http://qdrant:6333/collections/$QCOLL")"
    QDRANT_PT_COUNT="$(echo "$POINTS_RAW" | sed -n 's/.*"points_count" *: *\([0-9]*\).*/\1/p' | head -n1)"
    QDRANT_PT_COUNT="${QDRANT_PT_COUNT:-0}"
else
    echo "    WARNING: collection has no snapshot (likely empty)"
    : > "$STAGE/qdrant/$QCOLL.snapshot"
fi

# ── 3. Postgres dump (knowledge tables only) ─────────────────────────────
echo "==> Dumping postgres knowledge tables"
mkdir -p "$STAGE/postgres"
docker exec "$POSTGRES" pg_dump -U ele -d ele \
    --no-owner --no-acl --column-inserts \
    --table=knowledge_docs \
    --table=component_nodes \
    --table=component_edges \
    --table=alembic_version \
    > "$STAGE/postgres/knowledge.sql"
DOC_COUNT="$(docker exec "$POSTGRES" psql -U ele -d ele -t -A -c \
    'SELECT count(*) FROM knowledge_docs;')"
NODE_COUNT="$(docker exec "$POSTGRES" psql -U ele -d ele -t -A -c \
    'SELECT count(*) FROM component_nodes;')"
EDGE_COUNT="$(docker exec "$POSTGRES" psql -U ele -d ele -t -A -c \
    'SELECT count(*) FROM component_edges;')"
echo "    knowledge_docs=$DOC_COUNT component_nodes=$NODE_COUNT component_edges=$EDGE_COUNT"

# ── 4. MinIO bucket copy (PDFs) ──────────────────────────────────────────
echo "==> Copying MinIO bucket '$MBUCKET'"
mkdir -p "$STAGE/minio"
PDF_COUNT=0
PDF_BYTES=0
if docker exec "$MINIO" test -d "/data/$MBUCKET"; then
    docker cp "$MINIO:/data/$MBUCKET" "$STAGE/minio/$MBUCKET"
    # MinIO erasure-coding stores each object as a directory containing
    # xl.meta + part.N files. We want the count of *PDF objects*, not the
    # internal pieces — those are dirs ending in .pdf under pdfs/<uuid>/.
    if [[ -d "$STAGE/minio/$MBUCKET/pdfs" ]]; then
        PDF_COUNT="$(find "$STAGE/minio/$MBUCKET/pdfs" -type d -name '*.pdf' \
            2>/dev/null | wc -l | tr -d ' ')"
    fi
    # Total bytes: include every internal file under the bucket so the
    # number reflects on-disk footprint. Prefer du -sb (Linux), fallback wc -c.
    if du -sb /tmp >/dev/null 2>&1; then
        PDF_BYTES="$(du -sb "$STAGE/minio/$MBUCKET" | awk '{print $1}')"
    else
        PDF_BYTES="$(find "$STAGE/minio/$MBUCKET" -type f -exec wc -c {} + \
            2>/dev/null | awk 'END{print $1}')"
    fi
    PDF_BYTES="${PDF_BYTES:-0}"
    echo "    pdf_count=$PDF_COUNT pdf_bytes=$PDF_BYTES"
else
    echo "    WARNING: bucket directory not found in MinIO container"
fi

# ── 5. Manifest ──────────────────────────────────────────────────────────
GIT_SHA="$(git -C "$(dirname "$0")/.." rev-parse --short HEAD 2>/dev/null || echo unknown)"
NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$STAGE/manifest.json" <<EOF
{
  "version": 1,
  "created_at": "$NOW_ISO",
  "git_sha": "$GIT_SHA",
  "embed_model": "$EMBED_MODEL",
  "embed_dim": $EMBED_DIM,
  "qdrant_collection": "$QCOLL",
  "minio_bucket": "$MBUCKET",
  "stats": {
    "qdrant_points": $QDRANT_PT_COUNT,
    "knowledge_docs": $DOC_COUNT,
    "component_nodes": $NODE_COUNT,
    "component_edges": $EDGE_COUNT,
    "minio_pdf_count": $PDF_COUNT,
    "minio_pdf_bytes": $PDF_BYTES
  }
}
EOF

# ── 6. Tar it up ─────────────────────────────────────────────────────────
OUT="$OUTPUT_DIR/knowledge-bundle-$TIMESTAMP.tgz"
echo "==> Packing → $OUT"
tar -czf "$OUT" -C "$STAGE" manifest.json qdrant postgres minio

SIZE_HUMAN="$(du -h "$OUT" | awk '{print $1}')"
echo
echo "DONE — $OUT ($SIZE_HUMAN)"
echo "Stats: docs=$DOC_COUNT nodes=$NODE_COUNT edges=$EDGE_COUNT \
qdrant_pts=$QDRANT_PT_COUNT pdfs=$PDF_COUNT"
