# Native PowerShell mirror of restore_knowledge.sh.
# DESTRUCTIVE — truncates 4 knowledge tables, clears MinIO bucket prefix,
# replaces the Qdrant collection.
#
# Usage:
#   .\scripts\restore_knowledge.ps1 -Bundle .\bundles\knowledge-bundle-XYZ.tgz
#   .\scripts\restore_knowledge.ps1 -Bundle ... -Force   # bypass embed check

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Bundle,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Bundle)) {
    throw "bundle file not found: $Bundle"
}

$projectName = if ($env:COMPOSE_PROJECT_NAME) { $env:COMPOSE_PROJECT_NAME } else { 'ee-assistant' }
$backend  = "$projectName-backend-1"
$postgres = "$projectName-postgres-1"
$qdrant   = "$projectName-qdrant-1"
$minio    = "$projectName-minio-1"

# ── 0. Pre-flight ─────────────────────────────────────────────────────────
Write-Host '==> Pre-flight checks'
foreach ($c in @($backend, $postgres, $qdrant, $minio)) {
    $running = docker inspect -f '{{.State.Running}}' $c 2>$null
    if ($running -ne 'true') {
        throw "container '$c' is not running. Run 'docker compose up -d' first."
    }
}

$stage = Join-Path $env:TEMP "krestore-$([guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $stage | Out-Null
$cleanup = { if (Test-Path $stage) { Remove-Item -Recurse -Force $stage } }

try {
    # ── 1. Unpack ─────────────────────────────────────────────────────────
    Write-Host "==> Unpacking $Bundle"
    Push-Location $stage
    try {
        tar -xzf (Resolve-Path $Bundle).Path
    } finally { Pop-Location }

    $manifestPath = Join-Path $stage 'manifest.json'
    if (-not (Test-Path $manifestPath)) {
        throw 'bundle is missing manifest.json'
    }
    $bundle = Get-Content $manifestPath -Raw | ConvertFrom-Json
    Write-Host ("    bundle: collection={0} bucket={1}" -f $bundle.qdrant_collection, $bundle.minio_bucket)
    Write-Host ("            embed_model={0} dim={1}" -f $bundle.embed_model, $bundle.embed_dim)
    Write-Host ("            docs={0} nodes={1} edges={2} qdrant_pts={3} pdfs={4}" -f `
        $bundle.stats.knowledge_docs, $bundle.stats.component_nodes, `
        $bundle.stats.component_edges, $bundle.stats.qdrant_points, `
        $bundle.stats.minio_pdf_count)

    # ── 2. Read live settings & gate on embed model/dim ───────────────────
    Write-Host '==> Comparing with live backend settings'
    $py = @'
import json
from app.config import settings
print(json.dumps({
    "qdrant_collection": settings.qdrant_collection,
    "minio_bucket": settings.minio_bucket,
    "embed_model": settings.effective_embed_model(),
    "embed_dim": settings.embedding_dim,
}))
'@
    $live = (docker exec $backend python -c $py) | ConvertFrom-Json
    Write-Host ("    live  : collection={0} bucket={1} model={2} dim={3}" -f `
        $live.qdrant_collection, $live.minio_bucket, $live.embed_model, $live.embed_dim)

    if ($bundle.embed_model -ne $live.embed_model -or $bundle.embed_dim -ne $live.embed_dim) {
        if (-not $Force) {
            Write-Host ''
            Write-Host 'ERROR: embed model / dim mismatch.' -ForegroundColor Red
            Write-Host ("  bundle: {0} ({1})" -f $bundle.embed_model, $bundle.embed_dim)
            Write-Host ("  live  : {0} ({1})" -f $live.embed_model, $live.embed_dim)
            Write-Host '  Re-run with -Force only if you understand the consequences.'
            exit 3
        }
        Write-Warning '    -Force given; proceeding despite mismatch'
    }

    $bcoll = $bundle.qdrant_collection
    $bbucket = $bundle.minio_bucket

    # ── 3. PG restore ─────────────────────────────────────────────────────
    Write-Host '==> Restoring postgres knowledge tables'
    docker exec $postgres psql -U ele -d ele -c `
        'TRUNCATE component_edges, component_nodes, knowledge_docs CASCADE;' | Out-Null
    Get-Content (Join-Path $stage 'postgres\knowledge.sql') -Raw `
        | docker exec -i $postgres psql -U ele -d ele -q | Out-Null
    $docNow = (docker exec $postgres psql -U ele -d ele -t -A -c 'SELECT count(*) FROM knowledge_docs;').Trim()
    Write-Host "    knowledge_docs after restore: $docNow (manifest: $($bundle.stats.knowledge_docs))"

    # ── 4. Qdrant restore ─────────────────────────────────────────────────
    Write-Host "==> Restoring Qdrant collection '$bcoll'"
    $snapPath = Join-Path $stage "qdrant\$bcoll.snapshot"
    if ((Test-Path $snapPath) -and (Get-Item $snapPath).Length -gt 0) {
        docker exec $qdrant mkdir -p "/qdrant/snapshots/$bcoll" | Out-Null
        docker cp $snapPath "${qdrant}:/qdrant/snapshots/$bcoll/restore.snapshot" | Out-Null
        $body = '{"location":"file:///qdrant/snapshots/' + $bcoll + '/restore.snapshot","priority":"snapshot"}'
        $resp = docker exec $backend curl -s -X PUT `
            -H 'Content-Type: application/json' `
            --data $body `
            "http://qdrant:6333/collections/$bcoll/snapshots/recover"
        Write-Host "    recover response: $resp"
        $collInfo = docker exec $backend curl -s "http://qdrant:6333/collections/$bcoll"
        if ($collInfo -match '"points_count"\s*:\s*(\d+)') {
            Write-Host "    points after restore: $($Matches[1]) (manifest: $($bundle.stats.qdrant_points))"
        }
    } else {
        Write-Host '    SKIPPED (snapshot is empty in bundle)'
    }

    # ── 5. MinIO restore ──────────────────────────────────────────────────
    Write-Host "==> Restoring MinIO bucket '$bbucket'"
    $bundleBucketDir = Join-Path $stage "minio\$bbucket"
    if (Test-Path $bundleBucketDir) {
        docker exec $minio sh -c "rm -rf /data/$bbucket && mkdir -p /data/$bbucket" | Out-Null
        docker cp "$bundleBucketDir\." "${minio}:/data/$bbucket/" | Out-Null
        $pdfNow = (docker exec $minio sh -c "find /data/$bbucket -type f | wc -l").Trim()
        Write-Host "    pdf files after restore: $pdfNow (manifest: $($bundle.stats.minio_pdf_count))"
    } else {
        Write-Host '    SKIPPED (no minio dir in bundle)'
    }

    Write-Host ''
    Write-Host "DONE — knowledge restored from $Bundle"
    Write-Host 'Open the Knowledge panel in the UI to verify.'
}
finally {
    & $cleanup
}
