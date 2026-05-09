import { useEffect, useRef, useState } from 'react';
import { useStore, type KnowledgeDoc, type KnowledgeDocStatus, type KnowledgeSourceType } from '../../models/store';
import { t } from '../../services/i18n';
import { api } from '../../services/api';

const STATUS_COLORS: Record<KnowledgeDocStatus, string> = {
  uploading: 'bg-gray-500/20 text-gray-400',
  chunking: 'bg-blue-500/20 text-blue-400',
  embedding: 'bg-indigo-500/20 text-indigo-400',
  graph_extracting: 'bg-purple-500/20 text-purple-400',
  ready: 'bg-emerald-500/20 text-emerald-400',
  error: 'bg-red-500/20 text-red-400',
};

// Per-source-type badge styles — kept distinct so users can scan a long
// list and instantly tell URL-imported pages from a binary PDF.
const SOURCE_BADGE: Record<KnowledgeSourceType, { label: string; cls: string }> = {
  pdf:  { label: 'PDF',  cls: 'bg-rose-500/20 text-rose-400' },
  txt:  { label: 'TXT',  cls: 'bg-slate-500/20 text-slate-300' },
  md:   { label: 'MD',   cls: 'bg-amber-500/20 text-amber-300' },
  html: { label: 'HTML', cls: 'bg-orange-500/20 text-orange-300' },
  docx: { label: 'DOCX', cls: 'bg-sky-500/20 text-sky-300' },
  url:  { label: 'URL',  cls: 'bg-emerald-500/20 text-emerald-300' },
};

const TERMINAL_STATUSES: KnowledgeDocStatus[] = ['ready', 'error'];

function isTerminal(status: KnowledgeDocStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

// Bounded-concurrency runner — preserves order of dispatch but lets `limit`
// workers progress in parallel. `cancelled()` is polled before pulling the
// next item so callers can short-circuit a queue.
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<void>,
  cancelled: () => boolean = () => false,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      if (cancelled()) return;
      const i = cursor++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

// Hard cap — single-file POST drives a long-lived LLM embedding loop on
// the backend, so 2 in parallel is a healthy compromise between wall-clock
// time and SiliconFlow rate-limit risk.
const UPLOAD_CONCURRENCY = 2;

// Must match the `client_max_body_size` configured for /api/ in
// frontend/nginx.conf. Bump both together if you ever raise the cap.
const MAX_UPLOAD_BYTES = 800 * 1024 * 1024;

// Whitelist must mirror the backend's SUPPORTED_SUFFIXES tuple in
// app/core/extractors.py. Adding a new format means updating both.
const SUPPORTED_EXT_RE = /\.(pdf|txt|md|markdown|html|htm|docx)$/i;
const SUPPORTED_MIMES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/html',
  'application/xhtml+xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function isSupportedFile(f: File): boolean {
  if (f.size === 0) return false;
  if (SUPPORTED_EXT_RE.test(f.name)) return true;
  return SUPPORTED_MIMES.has(f.type);
}

function isWithinSizeLimit(f: File): boolean {
  return f.size <= MAX_UPLOAD_BYTES;
}

interface UploadQueueState {
  total: number;
  done: number;
  success: number;
  failed: number;
}

export function KnowledgePanel() {
  const language = useStore((s) => s.language);
  const tr = t(language);

  const docs = useStore((s) => s.knowledgeDocs);
  const setDocs = useStore((s) => s.setKnowledgeDocs);
  const selectionMode = useStore((s) => s.knowledgeSelectionMode);
  const toggleSelectionMode = useStore((s) => s.toggleKnowledgeSelectionMode);
  const selectedIds = useStore((s) => s.selectedDocIds);
  const toggleDocSelection = useStore((s) => s.toggleDocSelection);
  const selectAllDocs = useStore((s) => s.selectAllDocs);
  const clearDocSelection = useStore((s) => s.clearDocSelection);
  const loading = useStore((s) => s.knowledgeLoading);
  const setLoading = useStore((s) => s.setKnowledgeLoading);

  const [searchQuery, setSearchQuery] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [queueState, setQueueState] = useState<UploadQueueState | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlSubmitting, setUrlSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef<boolean>(false);
  // True while at least one file in the queue is in-flight; drives button
  // spinner state. Distinct from queueState which tracks counts.
  const uploading = queueState !== null;

  // Track live WS connections for active docs
  const activeSockets = useRef<Map<string, WebSocket>>(new Map());

  useEffect(() => {
    fetchDocs();
  }, []);

  // Subscribe to WS for docs in non-terminal status
  useEffect(() => {
    docs.forEach((doc) => {
      if (!isTerminal(doc.status) && !activeSockets.current.has(doc.id)) {
        connectProgress(doc.id);
      }
    });
  }, [docs]);

  function connectProgress(docId: string) {
    if (activeSockets.current.has(docId)) {
      activeSockets.current.get(docId)?.close();
      activeSockets.current.delete(docId);
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/knowledge/docs/${docId}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      const event = JSON.parse(e.data);
      setDocs(
        useStore.getState().knowledgeDocs.map((d) =>
          d.id === docId ? { ...d, status: event.stage } : d
        )
      );
      if (isTerminal(event.stage)) {
        ws.close();
        activeSockets.current.delete(docId);
      }
    };
    ws.onclose = () => {
      activeSockets.current.delete(docId);
    };
    ws.onerror = () => {
      activeSockets.current.delete(docId);
    };
    activeSockets.current.set(docId, ws);
  }

  async function fetchDocs() {
    setLoading(true);
    try {
      const data = await api.listKnowledgeDocs();
      setDocs(data as KnowledgeDoc[]);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  // Upload a single file via the existing per-doc endpoint. Returns the
  // created KnowledgeDoc on success, throws on failure (so the queue
  // worker can count it as failed without aborting siblings).
  async function uploadOneFile(file: File): Promise<KnowledgeDoc> {
    const settings = useStore.getState().settings;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('manufacturer', 'Unknown');
    formData.append('category_tags', '[]');
    formData.append('llm_config', JSON.stringify(settings.chat));
    formData.append('embedding_config', JSON.stringify(settings.embedding));
    const res = await fetch('/api/knowledge/docs', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`[${res.status}] ${errText || file.name}`);
    }
    return (await res.json()) as KnowledgeDoc;
  }

  async function handleFiles(rawFiles: FileList | File[]) {
    const all = Array.from(rawFiles);
    const supported = all.filter(isSupportedFile);
    const skippedUnsupported = all.length - supported.length;

    // Size pre-check happens after the type filter so unsupported garbage
    // doesn't poison the size message. Files over the nginx cap are dropped
    // here with a dedicated error to avoid the opaque 413 round-trip.
    const acceptable = supported.filter(isWithinSizeLimit);
    const oversized = supported.length - acceptable.length;

    const errs: string[] = [];
    if (skippedUnsupported > 0) errs.push(tr.knowledge.skippedUnsupported(skippedUnsupported));
    if (oversized > 0) errs.push(tr.knowledge.oversizedFiles(oversized, MAX_UPLOAD_BYTES));
    setUploadError(errs.join(' · '));

    if (acceptable.length === 0) return;
    const pdfsToUpload = acceptable;

    cancelledRef.current = false;
    setQueueState({ total: pdfsToUpload.length, done: 0, success: 0, failed: 0 });

    await runWithConcurrency(
      pdfsToUpload,
      UPLOAD_CONCURRENCY,
      async (file) => {
        try {
          const newDoc = await uploadOneFile(file);
          // Prepend immediately so the doc appears in the list with its
          // own status badge; the existing useEffect will spin up its WS
          // connection automatically.
          setDocs([newDoc, ...useStore.getState().knowledgeDocs]);
          setQueueState((q) =>
            q ? { ...q, done: q.done + 1, success: q.success + 1 } : q
          );
        } catch (err: any) {
          setQueueState((q) =>
            q ? { ...q, done: q.done + 1, failed: q.failed + 1 } : q
          );
          setUploadError(`Upload failed: ${err?.message ?? file.name}`);
        }
      },
      () => cancelledRef.current,
    );

    // Brief settle so the user sees the final counts before the widget
    // disappears, then clear queue state and the file input.
    setTimeout(() => setQueueState(null), 1500);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      void handleFiles(files);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      void handleFiles(files);
    }
  }

  function cancelQueue() {
    cancelledRef.current = true;
  }

  async function handleUrlSubmit() {
    const url = urlInput.trim();
    if (!url) return;
    // Cheap shape validation — server still does the real work.
    if (!/^https?:\/\//i.test(url)) {
      setUploadError(tr.knowledge.urlInvalid);
      return;
    }
    setUploadError('');
    setUrlSubmitting(true);
    try {
      const newDoc = await api.ingestUrl(url);
      setDocs([newDoc as KnowledgeDoc, ...useStore.getState().knowledgeDocs]);
      setUrlInput('');
    } catch (err: any) {
      setUploadError(`URL ${tr.knowledge.uploadFailed}: ${err?.message ?? url}`);
    } finally {
      setUrlSubmitting(false);
    }
  }

  async function handleBatchDelete() {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      await api.deleteKnowledgeDocs(Array.from(selectedIds));
      setDocs(docs.filter((d) => !selectedIds.has(d.id)));
      clearDocSelection();
    } finally {
      setDeleting(false);
    }
  }

  const filteredDocs = searchQuery
    ? docs.filter(
        (d) =>
          d.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.manufacturer.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.category_tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : docs;

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex-1 flex flex-col p-0 overflow-hidden min-h-0">
      {/* Header */}
      <div className="p-6 pb-2 border-b border-neutral-800 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-neutral-300 tracking-wide">{tr.knowledge.title}</h3>
          <button
            onClick={toggleSelectionMode}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              selectionMode
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700'
            }`}
          >
            {selectionMode ? tr.knowledge.exitSelect : tr.knowledge.select}
          </button>
        </div>
        <div className="relative">
          <input
            id="knowledge-search"
            name="knowledge-search"
            type="text"
            placeholder={tr.knowledge.search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder:text-neutral-600 transition-colors"
          />
          <svg
            className="absolute left-3 top-3 w-4 h-4 text-neutral-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3 pr-2 custom-scrollbar">
        {loading && (
          <p className="text-xs text-neutral-500 text-center py-8">Loading...</p>
        )}

        {!loading && filteredDocs.length === 0 && (
          <p className="text-xs text-neutral-500 text-center py-8">{tr.knowledge.noDocs}</p>
        )}

        {filteredDocs.map((doc) => (
          <div
            key={doc.id}
            onClick={() => selectionMode && toggleDocSelection(doc.id)}
            className={`group border rounded-2xl p-4 transition-colors relative overflow-hidden ${
              selectionMode
                ? selectedIds.has(doc.id)
                  ? 'bg-indigo-500/10 border-indigo-500/40 cursor-pointer'
                  : 'bg-neutral-800/50 border-neutral-800 hover:border-neutral-700 cursor-pointer'
                : 'bg-neutral-800/50 border-neutral-800 hover:bg-neutral-800'
            }`}
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/5 rounded-bl-full group-hover:bg-indigo-500/10 transition-colors" />
            <div className="flex items-start gap-3">
              {selectionMode && (
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    selectedIds.has(doc.id)
                      ? 'bg-indigo-500 border-indigo-500'
                      : 'border-neutral-600'
                  }`}
                >
                  {selectedIds.has(doc.id) && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {(() => {
                    const badge = SOURCE_BADGE[doc.source_type ?? 'pdf'] ?? SOURCE_BADGE.pdf;
                    return (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    );
                  })()}
                  <h4 className="text-sm font-medium text-neutral-200 truncate" title={doc.source_url ?? doc.filename}>
                    {doc.filename}
                  </h4>
                </div>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[doc.status] || STATUS_COLORS.error}`}>
                    {isTerminal(doc.status) && doc.status === 'ready' && '✓ '}
                    {isTerminal(doc.status) && doc.status === 'error' && '✗ '}
                    {tr.knowledge.status[doc.status] || doc.status}
                  </span>
                  {doc.status === 'error' && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        console.log(`Retrying document ${doc.id}...`);
                        try {
                          const updated = await api.retryKnowledgeDoc(doc.id);
                          console.log('Retry response:', updated);
                          if (updated && updated.status) {
                            setDocs(useStore.getState().knowledgeDocs.map(d => 
                              d.id === doc.id ? { ...d, status: updated.status } : d
                            ));
                            connectProgress(doc.id);
                          } else {
                            console.error('Retry failed: Invalid response format', updated);
                            setUploadError('重试失败：服务器返回格式错误');
                          }
                        } catch (err: any) {
                          console.error('Retry failed:', err);
                          setUploadError(`重试失败: ${err.message || '未知错误'}`);
                        }
                      }}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors"
                    >
                      ↻ 重试
                    </button>
                  )}
                  <span className="text-[10px] text-neutral-500">{doc.chunk_count} 块</span>
                  <span className="text-[10px] text-neutral-600">{formatDate(doc.uploaded_at)}</span>
                  {doc.manufacturer !== 'Unknown' && (
                    <span className="text-[10px] text-neutral-500">{doc.manufacturer}</span>
                  )}
                </div>
                {doc.category_tags.length > 0 && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {doc.category_tags.map((tag) => (
                      <span key={tag} className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-neutral-700/50 text-neutral-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Selection mode action bar */}
      {selectionMode && (
        <div className="p-4 border-t border-neutral-800 bg-neutral-900/80 backdrop-blur shrink-0 flex items-center justify-between">
          <span className="text-xs text-neutral-400">{tr.knowledge.selected(selectedIds.size)}</span>
          <div className="flex gap-2">
            <button
              onClick={selectAllDocs}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white transition-colors"
            >
              {tr.knowledge.selectAll}
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0 || deleting}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {deleting ? tr.knowledge.deleting : tr.knowledge.deleteSelected}
            </button>
          </div>
        </div>
      )}

      {/* Upload */}
      <div className="p-6 border-t border-neutral-800 shrink-0 space-y-3">
        {uploadError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {uploadError}
          </div>
        )}

        {/* Queue progress widget — only visible while a queue is active */}
        {queueState && (
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-indigo-300">
                {tr.knowledge.queueProgress(queueState.done, queueState.total)}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-neutral-400">
                  {tr.knowledge.queueSummary(queueState.success, queueState.failed)}
                </span>
                {queueState.done < queueState.total && !cancelledRef.current && (
                  <button
                    onClick={cancelQueue}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
                    title="Skip remaining; in-flight uploads still finish"
                  >
                    {tr.knowledge.cancel}
                  </button>
                )}
              </div>
            </div>
            <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{
                  width: `${queueState.total === 0 ? 0 : (queueState.done / queueState.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Hidden native input — the dropzone & button trigger it.
            `accept` lists every supported file type. The browser still
            allows "All files" so we re-check on the JS side too. */}
        <input
          id="knowledge-file-upload"
          name="knowledge-file-upload"
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md,.markdown,.html,.htm,.docx,application/pdf,text/plain,text/markdown,text/html,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          onChange={handleInputChange}
          className="hidden"
        />

        {/* URL ingestion — single-page fetch on the server. We render this
            above the dropzone so users discover the alternative without
            it competing for the dominant click target. */}
        <div className="mb-3 flex items-stretch gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleUrlSubmit();
            }}
            placeholder={tr.knowledge.urlPlaceholder}
            disabled={urlSubmitting}
            className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg bg-neutral-800/60 border border-neutral-700 focus:border-indigo-500/60 focus:outline-none text-neutral-200 placeholder-neutral-500 disabled:opacity-50"
          />
          <button
            onClick={() => void handleUrlSubmit()}
            disabled={urlSubmitting || !urlInput.trim()}
            className="text-xs font-bold px-3 py-2 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {urlSubmitting ? '…' : tr.knowledge.addUrl}
          </button>
        </div>

        {/* Dropzone — also serves as the upload button. Drag events on the
            outer div allow drops anywhere in the zone, not just on text. */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!isDragOver) setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragOver(false);
          }}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`w-full px-4 py-5 rounded-xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
            isDragOver
              ? 'border-indigo-400 bg-indigo-500/15 text-indigo-200'
              : uploading
              ? 'border-neutral-700 bg-neutral-800/30 text-neutral-500 cursor-wait'
              : 'border-neutral-700 hover:border-indigo-500/60 bg-neutral-800/40 hover:bg-neutral-800 text-neutral-300'
          }`}
        >
          {uploading ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.9A5 5 0 0119.96 9.5a4 4 0 01-.96 7.5H7zm5-9v9m0 0l-3-3m3 3l3-3" />
            </svg>
          )}
          <span className="text-xs font-bold">
            {isDragOver
              ? tr.knowledge.dropActive
              : uploading
              ? tr.knowledge.status.uploading
              : tr.knowledge.uploadMulti}
          </span>
          {!uploading && !isDragOver && (
            <span className="text-[10px] text-neutral-500">{tr.knowledge.dropHint}</span>
          )}
        </div>
      </div>
    </div>
  );
}
