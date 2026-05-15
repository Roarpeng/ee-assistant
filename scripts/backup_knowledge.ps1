# Native PowerShell mirror of backup_knowledge.sh — for Windows hosts that
# don't have git-bash. Same bundle layout, same manifest format.
#
# Requirements: Docker Desktop, PowerShell 5.1+ (Windows 10+ ships with
# `tar` for tgz support).
#
# Usage:
#   .\scripts\backup_knowledge.ps1
#   .\scripts\backup_knowledge.ps1 -OutputDir .\somewhere

[CmdletBinding()]
param(
    [string]$OutputDir = ".\bundles"
)

$ErrorActionPreference = 'Stop'

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

if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir | Out-Null }
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$stage = Join-Path $env:TEMP "kbundle-$timestamp"
New-Item -ItemType Directory -Path $stage | Out-Null
Write-Host "    staging dir: $stage"

# Cleanup on any exit
$cleanup = { if (Test-Path $stage) { Remove-Item -Recurse -Force $stage } }

try {
    # ── 1. Read settings from running backend ─────────────────────────────
    Write-Host '==> Reading backend settings'
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
    $settingsRaw = docker exec $backend python -c $py
    $cfg = $settingsRaw | ConvertFrom-Json
    $qcoll = $cfg.qdrant_collection
    $mbucket = $cfg.minio_bucket
    $embedModel = $cfg.embed_model
    $embedDim = [int]$cfg.embed_dim
    Write-Host "    collection=$qcoll bucket=$mbucket model=$embedModel dim=$embedDim"

    # ── 2. Qdrant snapshot ────────────────────────────────────────────────
    Write-Host "==> Creating Qdrant snapshot for collection '$qcoll'"
    New-Item -ItemType Directory -Path (Join-Path $stage 'qdrant') | Out-Null
    $qdrantPoints = 0
    $snapResp = docker exec $backend curl -s -X POST "http://qdrant:6333/collections/$qcoll/snapshots"
    if ($snapResp -match '"name"\s*:\s*"([^"]+)"') {
        $snapName = $Matches[1]
        Write-Host "    snapshot file: $snapName"
        docker cp "${qdrant}:/qdrant/snapshots/$qcoll/$snapName" `
            (Join-Path $stage "qdrant\$qcoll.snapshot") | Out-Null
        # Best-effort cleanup inside qdrant container
        docker exec $backend curl -s -X DELETE "http://qdrant:6333/collections/$qcoll/snapshots/$snapName" | Out-Null

        $collInfo = docker exec $backend curl -s "http://qdrant:6333/collections/$qcoll"
        if ($collInfo -match '"points_count"\s*:\s*(\d+)') { $qdrantPoints = [int]$Matches[1] }
    } else {
        Write-Warning '    collection has no snapshot (likely empty)'
        Set-Content -Path (Join-Path $stage "qdrant\$qcoll.snapshot") -Value '' -NoNewline
    }

    # ── 3. Postgres dump ──────────────────────────────────────────────────
    Write-Host '==> Dumping postgres knowledge tables'
    New-Item -ItemType Directory -Path (Join-Path $stage 'postgres') | Out-Null
    $sqlPath = Join-Path $stage 'postgres\knowledge.sql'
    docker exec $postgres pg_dump -U ele -d ele `
        --no-owner --no-acl --column-inserts `
        --table=knowledge_docs --table=component_nodes `
        --table=component_edges --table=alembic_version `
        | Out-File -FilePath $sqlPath -Encoding utf8

    $docCount  = [int](docker exec $postgres psql -U ele -d ele -t -A -c 'SELECT count(*) FROM knowledge_docs;').Trim()
    $nodeCount = [int](docker exec $postgres psql -U ele -d ele -t -A -c 'SELECT count(*) FROM component_nodes;').Trim()
    $edgeCount = [int](docker exec $postgres psql -U ele -d ele -t -A -c 'SELECT count(*) FROM component_edges;').Trim()
    Write-Host "    knowledge_docs=$docCount component_nodes=$nodeCount component_edges=$edgeCount"

    # ── 4. MinIO bucket copy ──────────────────────────────────────────────
    Write-Host "==> Copying MinIO bucket '$mbucket'"
    $minioStage = Join-Path $stage 'minio'
    New-Item -ItemType Directory -Path $minioStage | Out-Null
    $pdfCount = 0
    $pdfBytes = 0
    $bucketExists = docker exec $minio sh -c "test -d /data/$mbucket && echo yes || echo no"
    if ($bucketExists.Trim() -eq 'yes') {
        docker cp "${minio}:/data/$mbucket" (Join-Path $minioStage $mbucket) | Out-Null
        $bucketDir = Join-Path $minioStage $mbucket
        $files = Get-ChildItem -Path $bucketDir -Recurse -File -ErrorAction SilentlyContinue
        $pdfBytes = ($files | Measure-Object -Property Length -Sum).Sum
        if (-not $pdfBytes) { $pdfBytes = 0 }
        # MinIO erasure-coding stores each object as a directory of part.N+xl.meta
        # files. The "PDF count" we want is the number of leaf object dirs
        # under pdfs/<doc-uuid>/<filename>.pdf — three levels deep from bucket root.
        $pdfsRoot = Join-Path $bucketDir 'pdfs'
        if (Test-Path $pdfsRoot) {
            $pdfCount = (Get-ChildItem -Path $pdfsRoot -Recurse -Directory `
                -ErrorAction SilentlyContinue `
                | Where-Object { $_.Name -like '*.pdf' }).Count
        }
        Write-Host "    pdf_count=$pdfCount pdf_bytes=$pdfBytes"
    } else {
        Write-Warning '    bucket directory not found in MinIO container'
    }

    # ── 5. Manifest ───────────────────────────────────────────────────────
    $gitSha = try { (git -C "$PSScriptRoot\.." rev-parse --short HEAD).Trim() } catch { 'unknown' }
    $nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $manifest = [ordered]@{
        version = 1
        created_at = $nowIso
        git_sha = $gitSha
        embed_model = $embedModel
        embed_dim = $embedDim
        qdrant_collection = $qcoll
        minio_bucket = $mbucket
        stats = [ordered]@{
            qdrant_points = $qdrantPoints
            knowledge_docs = $docCount
            component_nodes = $nodeCount
            component_edges = $edgeCount
            minio_pdf_count = $pdfCount
            minio_pdf_bytes = [int64]$pdfBytes
        }
    }
    $manifest | ConvertTo-Json -Depth 6 | Out-File `
        -FilePath (Join-Path $stage 'manifest.json') -Encoding utf8

    # ── 6. Tar it up (Windows 10+ ships `tar`) ────────────────────────────
    # tar runs from $stage, so the output path must be absolute or it'll
    # try to write inside the staging dir.
    $absOutDir = (Resolve-Path $OutputDir).Path
    $outFile = Join-Path $absOutDir "knowledge-bundle-$timestamp.tgz"
    Write-Host "==> Packing -> $outFile"
    Push-Location $stage
    try {
        tar -czf $outFile manifest.json qdrant postgres minio
    } finally { Pop-Location }

    $sizeMb = [math]::Round((Get-Item $outFile).Length / 1MB, 2)
    Write-Host ""
    Write-Host "DONE — $outFile ($sizeMb MB)"
    Write-Host ("Stats: docs={0} nodes={1} edges={2} qdrant_pts={3} pdfs={4}" -f `
        $docCount, $nodeCount, $edgeCount, $qdrantPoints, $pdfCount)
}
finally {
    & $cleanup
}
