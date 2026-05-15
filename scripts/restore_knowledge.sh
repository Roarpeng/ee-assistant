#!/usr/bin/env bash
# Restore a knowledge bundle (built by backup_knowledge.sh) onto the
# running compose stack. DESTRUCTIVE — truncates the 4 knowledge tables,
# clears the MinIO bucket prefix, and replaces the Qdrant collection.
#
# Usage:
#   ./scripts/restore_knowledge.sh <bundle.tgz>
#   ./scripts/restore_knowledge.sh <bundle.tgz> --force   # bypass embed check
#
# Requirements on host: docker, tar (gzip), bash.

set -euo pipefail

if [[ $# -lt 1 ]]; then
    sed -n '2,12p' "$0"; exit 2
fi
BUNDLE="$1"
FORCE=0
[[ "${2:-}" == "--force" ]] && FORCE=1

if [[ ! -f "$BUNDLE" ]]; then
    echo "ERROR: bundle file not found: $BUNDLE" >&2; exit 1
fi

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ee-assistant}"
BACKEND="${PROJECT_NAME}-backend-1"
POSTGRES="${PROJECT_NAME}-postgres-1"
QDRANT="${PROJECT_NAME}-qdrant-1"
MINIO="${PROJECT_NAME}-minio-1"

# ── 0. Pre-flight ─────────────────────────────────────────────────────────
echo "==> Pre-flight checks"
for c in "$BACKEND" "$POSTGRES" "$QDRANT" "$MINIO"; do
    if ! docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null | grep -qx true; then
        echo "ERROR: container '$c' is not running. Run 'docker compose up -d' first." >&2
        exit 1
    fi
done

STAGE="$(mktemp -d -t krestore.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT
echo "    staging dir: $STAGE"

# ── 1. Unpack bundle ──────────────────────────────────────────────────────
echo "==> Unpacking $BUNDLE"
tar -xzf "$BUNDLE" -C "$STAGE"

if [[ ! -f "$STAGE/manifest.json" ]]; then
    echo "ERROR: bundle is missing manifest.json" >&2; exit 1
fi

# Tiny manifest reader — avoids requiring jq on host
read_manifest() {
    sed -n "s/.*\"$1\"[ ]*:[ ]*\"\([^\"]*\)\".*/\1/p" "$STAGE/manifest.json" | head -n1
}
read_manifest_int() {
    sed -n "s/.*\"$1\"[ ]*:[ ]*\([0-9]*\).*/\1/p" "$STAGE/manifest.json" | head -n1
}
B_QCOLL="$(read_manifest qdrant_collection)"
B_BUCKET="$(read_manifest minio_bucket)"
B_MODEL="$(read_manifest embed_model)"
B_DIM="$(read_manifest_int embed_dim)"
B_DOC_COUNT="$(read_manifest_int knowledge_docs)"
B_NODE_COUNT="$(read_manifest_int component_nodes)"
B_EDGE_COUNT="$(read_manifest_int component_edges)"
B_QDRANT_PT="$(read_manifest_int qdrant_points)"
B_PDF_COUNT="$(read_manifest_int minio_pdf_count)"
echo "    bundle: collection=$B_QCOLL bucket=$B_BUCKET"
echo "            embed_model=$B_MODEL dim=$B_DIM"
echo "            docs=$B_DOC_COUNT nodes=$B_NODE_COUNT edges=$B_EDGE_COUNT \
qdrant_pts=$B_QDRANT_PT pdfs=$B_PDF_COUNT"

# ── 2. Read live settings & gate on embed model/dim ──────────────────────
echo "==> Comparing with live backend settings"
LIVE_JSON="$(docker exec "$BACKEND" python -c '
import json
from app.config import settings
print(json.dumps({
    "qdrant_collection": settings.qdrant_collection,
    "minio_bucket": settings.minio_bucket,
    "embed_model": settings.effective_embed_model(),
    "embed_dim": settings.embedding_dim,
}))
')"
L_QCOLL="$(echo "$LIVE_JSON" | sed -n 's/.*"qdrant_collection": *"\([^"]*\)".*/\1/p')"
L_BUCKET="$(echo "$LIVE_JSON" | sed -n 's/.*"minio_bucket": *"\([^"]*\)".*/\1/p')"
L_MODEL="$(echo "$LIVE_JSON" | sed -n 's/.*"embed_model": *"\([^"]*\)".*/\1/p')"
L_DIM="$(echo "$LIVE_JSON" | sed -n 's/.*"embed_dim": *\([0-9]*\).*/\1/p')"
echo "    live  : collection=$L_QCOLL bucket=$L_BUCKET model=$L_MODEL dim=$L_DIM"

if [[ "$B_MODEL" != "$L_MODEL" || "$B_DIM" != "$L_DIM" ]]; then
    if [[ "$FORCE" -eq 0 ]]; then
        echo
        echo "ERROR: embed model / dim mismatch."
        echo "  bundle: $B_MODEL ($B_DIM)"
        echo "  live  : $L_MODEL ($L_DIM)"
        echo "  Re-run with --force only if you understand the consequences."
        exit 3
    fi
    echo "    --force given; proceeding despite mismatch"
fi

# ── 3. PG restore ────────────────────────────────────────────────────────
echo "==> Restoring postgres knowledge tables"
docker exec "$POSTGRES" psql -U ele -d ele -c \
    'TRUNCATE component_edges, component_nodes, knowledge_docs CASCADE;' >/dev/null
docker exec -i "$POSTGRES" psql -U ele -d ele -q < "$STAGE/postgres/knowledge.sql" >/dev/null
DOC_NOW="$(docker exec "$POSTGRES" psql -U ele -d ele -t -A -c \
    'SELECT count(*) FROM knowledge_docs;')"
echo "    knowledge_docs after restore: $DOC_NOW (manifest: $B_DOC_COUNT)"

# ── 4. Qdrant restore ────────────────────────────────────────────────────
echo "==> Restoring Qdrant collection '$B_QCOLL'"
SNAP_FILE="$STAGE/qdrant/$B_QCOLL.snapshot"
if [[ -s "$SNAP_FILE" ]]; then
    docker exec "$QDRANT" mkdir -p "/qdrant/snapshots/$B_QCOLL"
    docker cp "$SNAP_FILE" \
        "$QDRANT:/qdrant/snapshots/$B_QCOLL/restore.snapshot"
    RECOVER_RESP="$(docker exec "$BACKEND" curl -s -X PUT \
        -H 'Content-Type: application/json' \
        --data "{\"location\":\"file:///qdrant/snapshots/$B_QCOLL/restore.snapshot\",\"priority\":\"snapshot\"}" \
        "http://qdrant:6333/collections/$B_QCOLL/snapshots/recover")"
    echo "    recover response: $RECOVER_RESP"
    PT_RAW="$(docker exec "$BACKEND" curl -s "http://qdrant:6333/collections/$B_QCOLL")"
    PT_NOW="$(echo "$PT_RAW" | sed -n 's/.*"points_count" *: *\([0-9]*\).*/\1/p' | head -n1)"
    echo "    points after restore: ${PT_NOW:-0} (manifest: $B_QDRANT_PT)"
else
    echo "    SKIPPED (snapshot is empty in bundle)"
fi

# ── 5. MinIO restore ─────────────────────────────────────────────────────
echo "==> Restoring MinIO bucket '$B_BUCKET'"
if [[ -d "$STAGE/minio/$B_BUCKET" ]]; then
    # Wipe existing bucket dir, then copy fresh contents in.
    docker exec "$MINIO" sh -c "rm -rf /data/$B_BUCKET && mkdir -p /data/$B_BUCKET"
    # Copy the contents of the bundle's bucket dir into the live bucket dir.
    # docker cp on a trailing /. copies *contents*, not the dir itself.
    docker cp "$STAGE/minio/$B_BUCKET/." "$MINIO:/data/$B_BUCKET/"
    PDF_NOW="$(docker exec "$MINIO" sh -c "find /data/$B_BUCKET -type f | wc -l")"
    echo "    pdf files after restore: $PDF_NOW (manifest: $B_PDF_COUNT)"
else
    echo "    SKIPPED (no minio dir in bundle)"
fi

echo
echo "DONE — knowledge restored from $BUNDLE"
echo "Open the Knowledge panel in the UI to verify."
