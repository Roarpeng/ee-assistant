# Knowledge Panel — Multi-file Upload Design

**Date**: 2026-05-09
**Scope**: Frontend only — KnowledgePanel.tsx upload UX
**Status**: approved (front-loop + concurrency=2 + drag-and-drop)

## Problem

Today the knowledge panel uploads one PDF at a time. Operators with 10–50
manuals must repeat the file picker N times, which is slow and error-prone
when seeding a fresh deployment.

## Goal

Pick or drag-drop N PDFs once → all N upload with bounded concurrency,
each file appears as its own row in the docs list with the existing per-doc
status badge + WS progress, and a small header summary shows `X / N done`.

## Non-Goals

- No backend changes. The current `POST /api/knowledge/docs` (single file)
  + per-doc WebSocket progress already covers our needs perfectly.
- No retry-all on failure. Each file fails independently; the existing
  per-row retry button (`POST /api/knowledge/docs/{id}/retry`) handles
  individual recovery.
- No queue persistence. If the user closes the tab mid-upload, in-flight
  requests get cancelled by the browser and any not-yet-started files in
  the local queue are dropped (per-doc state on the server is unaffected
  because each is its own POST).

## UX

### Trigger surface

Two equivalent entry points sharing one handler:

1. **"Upload" button** (existing) — opens native file picker with
   `multiple` attribute set, accepts `.pdf` only.
2. **Drop zone** (new) — a dashed-border rectangle just under the search
   bar, replacing the empty-state text when no docs exist, otherwise
   collapsed to a thin strip. Reacts to `dragover` (highlight) and `drop`
   (accept). Same file-type filtering applies.

### Validation

- Filter out non-PDF entries (mime type or `.pdf` extension) — show a toast
  "Skipped N non-PDF files".
- Reject zero-byte files — show inline warning, don't enqueue.

### Concurrency model

A small in-component `runWithConcurrency<T>(items, n, worker)` helper:

```ts
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const i = cursor++;
        await worker(items[i], i);
      }
    });
  await Promise.all(runners);
}
```

Limit hard-coded to **2**. Reasoning: single-file POST drives a long-lived
LLM embedding loop on the backend; running 2 in parallel halves wall-clock
time without overwhelming SiliconFlow rate limits we already hit on chat
streaming. Easy to bump later if needed.

### Header summary widget

When `pendingCount > 0` shows above the doc list:

```
┌─────────────────────────────────────────┐
│ Uploading 3 / 12  ✓ 8  ✗ 1   [×]        │
│ ████████░░░░░░░░░░░░░░░░░░░░ 25%        │
└─────────────────────────────────────────┘
```

- numerator = files done (success or failed)
- success / fail counts visible inline
- `[×]` cancels the queue (already-started uploads can't be cancelled
  cleanly because the backend ingest task continues asynchronously, but
  not-yet-started ones are dropped)
- auto-hides when `pendingCount === 0`

### Per-row state

Unchanged. Each successful POST returns a `KnowledgeDoc` immediately and
gets prepended to the docs list — the existing WebSocket connection drives
the row's badge through `uploading → chunking → embedding → graph_extracting → ready`.

## Implementation plan

Files touched:

1. **`frontend/src/views/components/KnowledgePanel.tsx`**
   - `<input type="file">` add `multiple`, ref unchanged
   - extract upload-one logic to `uploadOneFile(file: File): Promise<KnowledgeDoc | Error>`
   - new `handleFiles(files: File[])` does:
     - filter for `.pdf` (case-insensitive ext + mime)
     - bail with toast if all rejected
     - set `queueState({ total, done, success, failed, cancelled })`
     - call `runWithConcurrency(files, 2, async (file) => { ... })`
       - inside worker: optimistic `setDocs([newDoc, ...])` after each
         successful POST, increment counters
   - new `<DropZone>` JSX block above the docs list, controlled by
     existing `uploading` boolean (now meaning "queue active")
   - new `<UploadProgress>` JSX block (the header summary widget)

2. **`frontend/src/services/i18n.ts`** (if it has translations for
   knowledge panel) — add 3-4 new strings: `dropHint`, `uploadingX`,
   `skippedNonPdf`, `cancel`.

3. *No changes to:*
   - `services/api.ts` (uploadKnowledgeDoc already takes generic FormData)
   - `models/store.ts` (no new Zustand state needed; queue state is local)
   - any backend file

## Self-review

- **Placeholder scan**: none.
- **Internal consistency**: queue state lives in the same component that
  owns `docs` state, so success → list update is direct; per-doc badges
  drive themselves via existing WS code, no double-update path.
- **Scope check**: 1 file changed (+ tiny i18n if it has strings). No
  new dependencies, no API changes.
- **Ambiguity check**: "cancel queue" only stops *future* dispatches —
  in-flight POSTs complete (and their docs join the list with WS progress).
  The cancel button copy clarifies this with a tooltip.

## Verification plan

1. Pick 3 PDFs from explorer → all 3 appear in docs list within seconds,
   header shows `Uploading 0/3` then ticks up.
2. Drag-drop 5 PDFs onto the dropzone → same behavior.
3. Mix in one `.txt` file → toast "Skipped 1 non-PDF file", PDFs upload
   normally.
4. Pick 10 PDFs → confirm only 2 are in-flight at any time (Network tab).
5. Click cancel mid-queue → in-flight 2 finish, remaining are dropped,
   widget disappears.
6. After all done, refresh page → list state matches what's in DB.
