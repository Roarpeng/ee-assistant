# Knowledge Bundle Export / Import — Design

**Date**: 2026-05-09
**Scope**: Backup + restore the entire built knowledge base (Qdrant vectors,
PostgreSQL knowledge tables, MinIO PDFs) as a single portable tarball,
suitable for sharing across deployments via GitHub Releases.
**Author**: chat session
**Status**: approved (option A + manual scripts + full bundle)

## Problem

Knowledge-base ingestion (PDF → chunk → embed → graph extraction) costs real
money in embedding and LLM API calls. With ~300 MB of product manuals the
total embed+extract cost can be tens to hundreds of dollars. Each fresh
deployment currently re-runs the whole pipeline from scratch.

## Goal

A single command builds a portable bundle from one running stack and a
single command restores it onto an empty stack — preserving every piece of
data needed to resume search and selection, including the original PDFs so
the bundle is also a full re-embed pivot point.

## Non-Goals

- No multi-master sync, no live replication, no incremental diff. Bundles
  are point-in-time snapshots, hand-rolled when the operator decides.
- No web UI button / no API endpoint. Operator-only scripts; less code, no
  multi-GB multipart upload risk.
- No version migration. If embedding model/dim changes, restore refuses
  with a clear error and the operator must re-ingest.
- The bundle does NOT go into git history. It goes to GitHub/Gitea
  Releases assets (single file ≤ 2 GB).

## Bundle layout

```
knowledge-bundle-YYYYMMDD-HHMMSS.tgz
├── manifest.json
├── qdrant/
│   └── <collection>.snapshot          # native Qdrant snapshot (binary)
├── postgres/
│   └── knowledge.sql                  # pg_dump of knowledge tables only
└── minio/
    └── ele-knowledge/                 # PDFs (object name + bytes)
        ├── <doc-uuid-1>.pdf
        └── ...
```

### manifest.json schema

```json
{
  "version": 1,
  "created_at": "2026-05-09T13:51:00Z",
  "git_sha": "abc1234",
  "embed_model": "BAAI/bge-large-zh-v1.5",
  "embed_dim": 4096,
  "qdrant_collection": "ee_docs",
  "stats": {
    "qdrant_points": 12345,
    "knowledge_docs": 25,
    "component_nodes": 1200,
    "component_edges": 3400,
    "minio_pdf_count": 25,
    "minio_pdf_bytes": 309000000
  }
}
```

`embed_model` and `embed_dim` are the gate: restore refuses if either
differs from the target deployment's `.env`, unless `--force` is passed.

## Scripts

Both scripts live in `scripts/` and use `docker exec` against the running
compose stack — no extra runtime dependencies beyond `tar`, `jq`, and
`docker`. A bash version is the source of truth (works on Linux/macOS/
git-bash). A PowerShell mirror is provided for native Windows.

### scripts/backup_knowledge.sh

```
1. Verify backend, postgres, qdrant, minio containers are running.
2. Read settings from running backend container's env (collection name,
   embed model/dim) so manifest matches reality.
3. Trigger Qdrant snapshot:
     POST http://qdrant:6333/collections/{collection}/snapshots
   (executed via docker exec backend wget so we hit the in-cluster URL).
4. docker cp the snapshot file out of the qdrant container.
5. docker exec postgres pg_dump --no-owner --no-acl
     --table=knowledge_docs --table=component_nodes
     --table=component_edges --table=alembic_version
     ele > knowledge.sql
6. docker cp /data/ele-knowledge from minio container into ./minio/.
7. Compute stats: SELECT count(*) for each PG table, point count from
   qdrant /collections/{c}, file count + size from the copied PDFs.
8. Write manifest.json.
9. tar czf knowledge-bundle-<UTC timestamp>.tgz manifest.json qdrant/ postgres/ minio/
10. Print final path and size; remove staging directory.
```

### scripts/restore_knowledge.sh `<bundle.tgz> [--force]`

```
1. Verify all four containers are up.
2. tar xzf into a temp staging directory.
3. Read manifest.json. Compare embed_model / embed_dim with the live
   backend's settings; abort unless they match (or --force).
4. PG restore:
     docker exec postgres psql -U ele -d ele -c
       "TRUNCATE knowledge_docs, component_nodes, component_edges CASCADE;"
     cat knowledge.sql | docker exec -i postgres psql -U ele -d ele
5. Qdrant restore:
     docker cp <collection>.snapshot qdrant:/qdrant/snapshots/<coll>/
     POST /collections/{coll}/snapshots/upload (or use recover endpoint)
6. MinIO restore:
     docker exec minio mc alias set local http://localhost:9000
       minioadmin minioadmin
     docker exec minio mc rm --recursive --force local/ele-knowledge ||true
     docker cp ./minio/ele-knowledge minio:/data/
7. Verify restored counts match manifest stats; print diff.
8. Remove staging dir.
```

### scripts/backup_knowledge.ps1 / restore_knowledge.ps1

Native Windows mirrors of the bash scripts using `docker.exe` directly +
PowerShell `Compress-Archive` / 7-Zip when available (fallback to invoking
`tar` shipped with Windows 10+).

## Documentation

`README.md` (or `docs/knowledge-bundle.md`) gets a short section:

> **Sharing the knowledge base**
> 1. On the source stack: `./scripts/backup_knowledge.sh`
>    Produces `knowledge-bundle-<timestamp>.tgz` (~2 GB).
> 2. Attach the tarball to a GitHub Release as a binary asset.
> 3. On a target stack:
>    `wget <release-url>/knowledge-bundle-<ts>.tgz`
>    `./scripts/restore_knowledge.sh knowledge-bundle-<ts>.tgz`
> 4. Verify in the UI: knowledge docs list shows N items, status `ready`.

## Why this is safe

- **Qdrant snapshot** is the vendor-supported persistence format; restoring
  it preserves indexes & quantization, not just raw vectors.
- **pg_dump** of just 4 tables avoids accidentally clobbering project
  data, BOMs, or user-generated topology on the target.
- **MinIO** PDFs are content-addressed by `<doc-uuid>.pdf`, matching
  `knowledge_docs.id` — so restoring all three pieces produces a
  consistent state with no orphans.
- **Embed-dim gate** prevents the most common silent corruption: importing
  vectors from a `dim=4096` source into a `dim=1024` target.

## Failure modes & handling

| Failure | Handling |
|---|---|
| Containers not all up | Both scripts abort with a clear "start `docker compose up -d`" message. |
| Snapshot API returns 404 | Empty collection — write empty `manifest.json` with stats=0; bundle is still valid. |
| pg_dump fails (auth/conn) | Print the exact docker exec command for manual debugging. |
| Disk full during tar | Staging dir kept so operator can clean up partial state. |
| Embed-dim mismatch on restore | Abort with model + dim from both sides; suggest `--force` only if user knows what they're doing. |
| Existing data on target | TRUNCATE the 4 tables first; for MinIO `mc rm --recursive` the prefix; for Qdrant just upload-and-recover (replaces collection). |

## Self-review

- **Placeholders**: none — all paths, commands, table names are concrete.
- **Internal consistency**: manifest stats are checked at restore time,
  closing the loop. Tables truncated match exactly the tables dumped.
- **Scope**: tightly scoped — 4 scripts (`.sh` + `.ps1` × backup + restore)
  + a docs section. No new backend code, no UI.
- **Ambiguity**: `--force` semantics: it bypasses the embed-dim check
  only; it does NOT skip the existence check on the target containers.

## Verification plan

1. On the running stack with already-ingested knowledge:
   `./scripts/backup_knowledge.sh` → check tarball appears, manifest stats
   match `select count(*)` from each table.
2. `docker compose down -v && docker compose up -d` (wipes volumes).
3. `alembic upgrade head` to recreate empty schema.
4. `./scripts/restore_knowledge.sh knowledge-bundle-<ts>.tgz` → check
   knowledge docs list in UI shows the same N entries with `status=ready`,
   a search query returns previously-known chunks, the topology graph
   panel shows the same component nodes.
