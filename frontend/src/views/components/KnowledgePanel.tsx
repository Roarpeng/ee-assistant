import { useEffect, useRef, useState, useMemo } from 'react';
import { useStore, type KnowledgeDoc, type KnowledgeDocStatus, type KnowledgeSourceType } from '../../models/store';
import { t } from '../../services/i18n';
import { api } from '../../services/api';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import UploadIcon from '@mui/icons-material/Upload';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import SearchIcon from '@mui/icons-material/Search';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

const STATUS_STYLE: Record<KnowledgeDocStatus, { bg: string; color: string }> = {
  uploading: { bg: 'rgba(107,114,128,0.2)', color: '#9CA3AF' },
  chunking: { bg: 'rgba(59,130,246,0.2)', color: '#60A5FA' },
  embedding: { bg: 'rgba(129,140,248,0.2)', color: '#818CF8' },
  graph_extracting: { bg: 'rgba(168,85,247,0.2)', color: '#C084FC' },
  ready: { bg: 'rgba(16,185,129,0.2)', color: '#34D399' },
  error: { bg: 'rgba(239,68,68,0.2)', color: '#F87171' },
};

// Per-source-type badge styles — kept distinct so users can scan a long
// list and instantly tell URL-imported pages from a binary PDF.
const SOURCE_BADGE: Record<KnowledgeSourceType, { label: string; color: string; bg: string }> = {
  pdf:  { label: 'PDF',  color: '#FB7185', bg: 'rgba(244,63,94,0.2)' },
  txt:  { label: 'TXT',  color: '#CBD5E1', bg: 'rgba(100,116,139,0.2)' },
  md:   { label: 'MD',   color: '#FCD34D', bg: 'rgba(245,158,11,0.2)' },
  html: { label: 'HTML', color: '#FDBA74', bg: 'rgba(234,88,12,0.2)' },
  docx: { label: 'DOCX', color: '#7DD3FC', bg: 'rgba(14,165,233,0.2)' },
  url:  { label: 'URL',  color: '#6EE7B7', bg: 'rgba(16,185,129,0.2)' },
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
  const [mainTab, setMainTab] = useState<'docs' | 'graph'>('docs');
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
  const [searchMode, setSearchMode] = useState<'docs' | 'semantic'>('docs');
  const [semanticHits, setSemanticHits] = useState<
    Array<{ id: string; content: string; score: number; metadata?: Record<string, unknown> }>
  >([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState('');
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

  async function runSemanticSearch() {
    const q = searchQuery.trim();
    if (!q) {
      setSemanticHits([]);
      setSemanticError('');
      return;
    }
    setSemanticLoading(true);
    setSemanticError('');
    try {
      const data = await api.searchKnowledge(q);
      setSemanticHits(data?.results ?? []);
    } catch (err: unknown) {
      setSemanticHits([]);
      setSemanticError(err instanceof Error ? err.message : tr.knowledge.semanticNoHits);
    } finally {
      setSemanticLoading(false);
    }
  }

  const filteredDocs =
    searchMode === 'semantic'
      ? docs
      : searchQuery
        ? docs.filter(
            (d) =>
              d.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
              d.manufacturer.toLowerCase().includes(searchQuery.toLowerCase()) ||
              d.category_tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())),
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
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Tab Selector */}
      <Box sx={{ px: 3, pt: 1.5, display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 1, flexShrink: 0, bgcolor: 'background.paper' }}>
        <Button
          onClick={() => setMainTab('docs')}
          variant="text"
          size="small"
          sx={{
            fontSize: '0.75rem',
            fontWeight: 700,
            borderRadius: 0,
            borderBottom: mainTab === 'docs' ? '2px solid #4ec9ff' : 'none',
            color: mainTab === 'docs' ? '#4ec9ff' : 'text.disabled',
            pb: 1,
            '&:hover': { bgcolor: 'rgba(78,201,255,0.05)' }
          }}
        >
          文献知识库 (Documents)
        </Button>
        <Button
          onClick={() => setMainTab('graph')}
          variant="text"
          size="small"
          sx={{
            fontSize: '0.75rem',
            fontWeight: 700,
            borderRadius: 0,
            borderBottom: mainTab === 'graph' ? '2px solid #4ec9ff' : 'none',
            color: mainTab === 'graph' ? '#4ec9ff' : 'text.disabled',
            pb: 1,
            '&:hover': { bgcolor: 'rgba(78,201,255,0.05)' }
          }}
        >
          元器件图谱 (Component Graph)
        </Button>
      </Box>

      {mainTab === 'graph' ? (
        <ComponentGraphView />
      ) : (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {/* Header */}
      <Box sx={{ px: 3, py: 3, pb: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.secondary', letterSpacing: '0.025em' }}>
            {tr.knowledge.title}
          </Typography>
          <Button
            onClick={toggleSelectionMode}
            variant={selectionMode ? 'outlined' : 'text'}
            size="small"
            sx={{
              fontSize: '0.75rem',
              fontWeight: 500,
              px: 1.5,
              py: 0.5,
              minWidth: 0,
              ...(selectionMode
                ? { borderColor: 'rgba(129,140,248,0.3)', color: 'primary.light', bgcolor: 'rgba(129,140,248,0.1)' }
                : { color: 'text.disabled', '&:hover': { color: 'text.secondary' } }
              ),
            }}
          >
            {selectionMode ? tr.knowledge.exitSelect : tr.knowledge.select}
          </Button>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={searchMode}
            onChange={(_, v) => {
              if (v) {
                setSearchMode(v);
                setSemanticHits([]);
                setSemanticError('');
              }
            }}
          >
            <ToggleButton value="docs">{tr.knowledge.searchDocs}</ToggleButton>
            <ToggleButton value="semantic">{tr.knowledge.searchSemantic}</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            placeholder={tr.knowledge.search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (searchMode === 'semantic' && e.key === 'Enter') {
                e.preventDefault();
                void runSemanticSearch();
              }
            }}
            variant="outlined"
            fullWidth
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'background.default',
                borderRadius: 3,
                '& fieldset': { borderColor: 'divider' },
                '&:hover fieldset': { borderColor: 'primary.main' },
                '&.Mui-focused fieldset': { borderColor: 'primary.main' },
              },
              '& .MuiInputBase-input': {
                fontSize: '0.875rem',
                color: 'text.primary',
                '&::placeholder': { color: 'text.disabled', opacity: 1 },
              },
            }}
          />
          {searchMode === 'semantic' && (
            <Button
              variant="contained"
              size="small"
              disabled={semanticLoading || !searchQuery.trim()}
              onClick={() => void runSemanticSearch()}
              sx={{ flexShrink: 0, fontWeight: 700 }}
            >
              {semanticLoading ? tr.knowledge.semanticSearching : tr.knowledge.semanticSearch}
            </Button>
          )}
        </Box>
      </Box>

      {searchMode === 'semantic' && (
        <Box sx={{ px: 3, pb: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          {semanticError && (
            <Typography sx={{ fontSize: '0.75rem', color: 'error.main', mb: 1 }}>{semanticError}</Typography>
          )}
          {!semanticLoading && semanticHits.length === 0 && !semanticError && (
            <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>
              {searchQuery.trim() ? tr.knowledge.semanticNoHits : tr.knowledge.semanticEmpty}
            </Typography>
          )}
          {semanticHits.map((hit) => (
            <Paper key={String(hit.id)} variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, gap: 1 }}>
                <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>
                  {(hit.metadata?.filename as string) ?? (hit.metadata?.doc_id as string) ?? 'chunk'}
                </Typography>
                <Chip
                  size="small"
                  label={`${tr.knowledge.score} ${(hit.score * 100).toFixed(0)}%`}
                  sx={{ height: 20, fontSize: '0.65rem' }}
                />
              </Box>
              <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', whiteSpace: 'pre-wrap' }}>
                {hit.content.length > 320 ? `${hit.content.slice(0, 320)}…` : hit.content}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}

      {/* Document list */}
      <List sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2, display: 'flex', flexDirection: 'column', gap: 0, '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 3 } }}>
        {loading && (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', textAlign: 'center', py: 4 }}>
            Loading...
          </Typography>
        )}

        {!loading && filteredDocs.length === 0 && (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', textAlign: 'center', py: 4 }}>
            {tr.knowledge.noDocs}
          </Typography>
        )}

        {filteredDocs.map((doc) => {
          const isSelected = selectedIds.has(doc.id);
          return (
            <ListItem
              key={doc.id}
              disablePadding
              sx={{ display: 'block', mb: 1.5 }}
            >
              <Paper
                variant="outlined"
                onClick={() => selectionMode && toggleDocSelection(doc.id)}
                sx={{
                  borderRadius: 2,
                  p: 2,
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: selectionMode ? 'pointer' : 'default',
                  transition: 'background-color 0.2s, border-color 0.2s',
                  borderColor: selectionMode && isSelected ? 'rgba(129,140,248,0.4)' : 'divider',
                  bgcolor: selectionMode && isSelected ? 'rgba(129,140,248,0.1)' : 'background.paper',
                  '&:hover': selectionMode ? { borderColor: 'rgba(129,140,248,0.4)' } : { bgcolor: 'action.hover' },
                }}
              >
                {/* Decorative corner gradient */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: 64,
                    height: 64,
                    bgcolor: 'rgba(129,140,248,0.03)',
                    borderBottomLeftRadius: '100%',
                    pointerEvents: 'none',
                  }}
                />
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  {/* Selection checkbox */}
                  {selectionMode && (
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: 0.75,
                        border: '2px solid',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        mt: 0.25,
                        transition: 'all 0.2s',
                        borderColor: isSelected ? 'primary.main' : 'text.disabled',
                        bgcolor: isSelected ? 'primary.main' : 'transparent',
                      }}
                    >
                      {isSelected && <CheckCircleIcon sx={{ fontSize: 14, color: 'primary.contrastText' }} />}
                    </Box>
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {(() => {
                        const badge = SOURCE_BADGE[doc.source_type ?? 'pdf'] ?? SOURCE_BADGE.pdf;
                        return (
                          <Chip
                            label={badge.label}
                            size="small"
                            sx={{
                              fontSize: '0.625rem',
                              fontWeight: 700,
                              height: 20,
                              color: badge.color,
                              bgcolor: badge.bg,
                              '& .MuiChip-label': { px: 0.5 },
                            }}
                          />
                        );
                      })()}
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 500, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={doc.source_url ?? doc.filename}
                      >
                        {doc.filename}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
                      <Chip
                        label={`${isTerminal(doc.status) && doc.status === 'ready' ? '✓ ' : ''}${isTerminal(doc.status) && doc.status === 'error' ? '✗ ' : ''}${tr.knowledge.status[doc.status] || doc.status}`}
                        size="small"
                        sx={{
                          fontSize: '0.625rem',
                          fontWeight: 500,
                          height: 20,
                          bgcolor: STATUS_STYLE[doc.status]?.bg || STATUS_STYLE.error.bg,
                          color: STATUS_STYLE[doc.status]?.color || STATUS_STYLE.error.color,
                          '& .MuiChip-label': { px: 1 },
                        }}
                      />
                      {doc.status === 'error' && (
                        <Button
                          size="small"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const updated = await api.retryKnowledgeDoc(doc.id);
                              if (updated && updated.status) {
                                setDocs(useStore.getState().knowledgeDocs.map(d =>
                                  d.id === doc.id ? { ...d, status: updated.status } : d
                                ));
                                connectProgress(doc.id);
                              } else {
                                setUploadError('重试失败：服务器返回格式错误');
                              }
                            } catch (err: any) {
                              setUploadError(`重试失败: ${err.message || '未知错误'}`);
                            }
                          }}
                          sx={{
                            fontSize: '0.625rem',
                            fontWeight: 500,
                            minWidth: 0,
                            px: 1,
                            py: 0,
                            color: '#FBBF24',
                            bgcolor: 'rgba(234,179,8,0.2)',
                            '&:hover': { bgcolor: 'rgba(234,179,8,0.3)' },
                          }}
                        >
                          <RefreshIcon sx={{ fontSize: 12, mr: 0.25 }} /> 重试
                        </Button>
                      )}
                      <Typography component="span" sx={{ fontSize: '0.625rem', color: 'text.disabled' }}>
                        {doc.chunk_count} 块
                      </Typography>
                      <Typography component="span" sx={{ fontSize: '0.625rem', color: 'text.disabled' }}>
                        {formatDate(doc.uploaded_at)}
                      </Typography>
                      {doc.manufacturer !== 'Unknown' && (
                        <Typography component="span" sx={{ fontSize: '0.625rem', color: 'text.disabled' }}>
                          {doc.manufacturer}
                        </Typography>
                      )}
                    </Box>
                    {doc.category_tags.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
                        {doc.category_tags.map((tag) => (
                          <Chip
                            key={tag}
                            label={tag}
                            size="small"
                            sx={{
                              fontSize: '0.625rem',
                              fontWeight: 500,
                              height: 20,
                              bgcolor: 'rgba(64,64,64,0.5)',
                              color: 'text.disabled',
                              '& .MuiChip-label': { px: 0.75 },
                            }}
                          />
                        ))}
                      </Box>
                    )}
                  </Box>
                </Box>
              </Paper>
            </ListItem>
          );
        })}
      </List>

      {/* Selection mode action bar */}
      {selectionMode && (
        <Box
          sx={{
            px: 3,
            py: 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'rgba(23,23,23,0.8)',
            backdropFilter: 'blur(8px)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>
            {tr.knowledge.selected(selectedIds.size)}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              onClick={selectAllDocs}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.75rem', fontWeight: 500, px: 1.5, py: 0.5, minWidth: 0, borderColor: 'divider', color: 'text.secondary', '&:hover': { color: '#fff', borderColor: 'text.secondary' } }}
            >
              {tr.knowledge.selectAll}
            </Button>
            <Button
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0 || deleting}
              size="small"
              variant="outlined"
              startIcon={<DeleteIcon sx={{ fontSize: 14 }} />}
              sx={{
                fontSize: '0.75rem',
                fontWeight: 500,
                px: 1.5,
                py: 0.5,
                minWidth: 0,
                borderColor: 'rgba(239,68,68,0.3)',
                color: '#F87171',
                '&:hover': { bgcolor: 'rgba(239,68,68,0.1)', borderColor: '#F87171' },
                '&.Mui-disabled': { opacity: 0.4 },
              }}
            >
              {deleting ? tr.knowledge.deleting : tr.knowledge.deleteSelected}
            </Button>
          </Box>
        </Box>
      )}

      {/* Upload */}
      <Box sx={{ px: 3, py: 3, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {uploadError && (
          <Box
            sx={{
              fontSize: '0.75rem',
              color: '#F87171',
              bgcolor: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 2,
              px: 1.5,
              py: 1,
            }}
          >
            {uploadError}
          </Box>
        )}

        {/* Queue progress widget — only visible while a queue is active */}
        {queueState && (
          <Paper
            variant="outlined"
            sx={{
              bgcolor: 'rgba(129,140,248,0.1)',
              borderColor: 'rgba(129,140,248,0.3)',
              borderRadius: 2,
              p: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'primary.light' }}>
                {tr.knowledge.queueProgress(queueState.done, queueState.total)}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>
                  {tr.knowledge.queueSummary(queueState.success, queueState.failed)}
                </Typography>
                {queueState.done < queueState.total && !cancelledRef.current && (
                  <Button
                    onClick={cancelQueue}
                    size="small"
                    sx={{
                      fontSize: '0.625rem',
                      fontWeight: 500,
                      minWidth: 0,
                      px: 1,
                      py: 0.25,
                      color: 'text.disabled',
                      bgcolor: 'background.paper',
                      '&:hover': { color: 'text.primary' },
                    }}
                    title="Skip remaining; in-flight uploads still finish"
                  >
                    {tr.knowledge.cancel}
                  </Button>
                )}
              </Box>
            </Box>
            <LinearProgress
              variant="determinate"
              value={queueState.total === 0 ? 0 : (queueState.done / queueState.total) * 100}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: 'background.paper',
                '& .MuiLinearProgress-bar': { bgcolor: 'primary.main', borderRadius: 3, transition: 'width 0.3s' },
              }}
            />
          </Paper>
        )}

        {/* Hidden native input */}
        <input
          id="knowledge-file-upload"
          name="knowledge-file-upload"
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md,.markdown,.html,.htm,.docx,application/pdf,text/plain,text/markdown,text/html,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />

        {/* URL ingestion */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <TextField
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleUrlSubmit();
            }}
            placeholder={tr.knowledge.urlPlaceholder}
            disabled={urlSubmitting}
            variant="outlined"
            size="small"
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'rgba(30,41,59,0.6)',
                borderRadius: 2,
                '& fieldset': { borderColor: 'divider' },
                '&:hover fieldset': { borderColor: 'rgba(129,140,248,0.6)' },
              },
              '& .MuiInputBase-input': { fontSize: '0.75rem', color: 'text.primary', '&::placeholder': { color: 'text.disabled', opacity: 1 } },
            }}
          />
          <Button
            onClick={() => void handleUrlSubmit()}
            disabled={urlSubmitting || !urlInput.trim()}
            variant="outlined"
            size="small"
            sx={{
              fontSize: '0.75rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              borderColor: 'rgba(129,140,248,0.4)',
              color: 'primary.light',
              bgcolor: 'rgba(129,140,248,0.1)',
              '&:hover': { bgcolor: 'rgba(129,140,248,0.2)', borderColor: 'primary.light' },
              '&.Mui-disabled': { opacity: 0.4 },
            }}
          >
            {urlSubmitting ? '…' : tr.knowledge.addUrl}
          </Button>
        </Box>

        {/* Dropzone */}
        <Paper
          variant="outlined"
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
          sx={{
            p: 2.5,
            border: '2px dashed',
            borderColor: isDragOver ? 'primary.light' : uploading ? 'divider' : 'rgba(64,64,64,0.5)',
            borderRadius: 2,
            cursor: uploading ? 'wait' : 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            bgcolor: isDragOver
              ? 'rgba(129,140,248,0.08)'
              : uploading
              ? 'rgba(30,41,59,0.15)'
              : 'rgba(30,41,59,0.2)',
            transition: 'all 0.2s',
            '&:hover': uploading
              ? {}
              : {
                  borderColor: 'rgba(129,140,248,0.6)',
                  bgcolor: 'rgba(30,41,59,0.4)',
                },
          }}
        >
          {uploading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 20, height: 20, borderRadius: '50%', border: '3px solid', borderColor: 'divider', borderTopColor: 'primary.main', animation: 'spin 0.8s linear infinite' }}>
                {/* CSS spinner */}
              </Box>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.disabled' }}>
                {tr.knowledge.status.uploading}
              </Typography>
            </Box>
          ) : (
            <UploadIcon sx={{ fontSize: 24, color: isDragOver ? 'primary.light' : 'text.disabled' }} />
          )}
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: isDragOver ? 'primary.light' : uploading ? 'text.disabled' : 'text.secondary' }}>
            {isDragOver
              ? tr.knowledge.dropActive
              : uploading
              ? tr.knowledge.status.uploading
              : tr.knowledge.uploadMulti}
          </Typography>
          {!uploading && !isDragOver && (
            <Typography sx={{ fontSize: '0.625rem', color: 'text.disabled' }}>
              {tr.knowledge.dropHint}
            </Typography>
          )}
        </Paper>
      </Box>
    </Box>
      )}
    </Box>
  );
}


// ── Component Graph Visualizer & Editor (Louvain Clustering SVG Canvas) ──

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import MenuItem from '@mui/material/MenuItem';

const RELATION_COLORS: Record<string, string> = {
  REQUIRES_POWER: '#FB7185', // Rose
  OUTPUTS_SIGNAL: '#60A5FA', // Blue
  USES_PROTOCOL: '#34D399', // Emerald
  COMPATIBLE_WITH: '#818CF8', // Indigo
  ALTERNATIVE_TO: '#FBBF24', // Amber
  MOUNTS_ON: '#A78BFA', // Violet
  CONTROLS: '#F472B6', // Pink
  REQUIRES_ACCESSORY: '#CBD5E1', // Slate
};

const COMMUNITY_PALETTE = [
  '#4EC9FF', '#4ADE80', '#A78BFA', '#FB7185', '#FBBF24', '#F472B6',
  '#38BDF8', '#34D399', '#818CF8', '#F87171', '#F59E0B', '#EC4899'
];

interface GraphNode {
  id: string;
  name: string;
  component_type: string;
  properties: Record<string, any>;
  community?: string | null;
  source_doc_id?: string | null;
  created_at?: string;
}

interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation: string;
  properties: Record<string, any>;
  confidence: string;
}

function ComponentGraphView() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [error, setError] = useState('');

  // SVG 平移缩放状态
  const [pan, setPan] = useState({ x: 150, y: 150 });
  const [zoom, setZoom] = useState(0.8);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // 弹窗状态
  const [nodeDialogOpen, setNodeDialogOpen] = useState(false);
  const [edgeDialogOpen, setEdgeDialogOpen] = useState(false);

  // 表单状态
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeType, setNewNodeType] = useState('PLC');
  const [newNodePropsText, setNewNodePropsText] = useState('{\n  "brand": "Siemens"\n}');

  const [newEdgeSource, setNewEdgeSource] = useState('');
  const [newEdgeTarget, setNewEdgeTarget] = useState('');
  const [newEdgeRelation, setNewEdgeRelation] = useState('COMPATIBLE_WITH');
  const [newEdgePropsText, setNewEdgePropsText] = useState('{}');

  useEffect(() => {
    loadGraphData();
  }, []);

  async function loadGraphData() {
    setLoading(true);
    setError('');
    try {
      const [nodesData, edgesData] = await Promise.all([
        api.getGraphNodes(),
        api.getGraphEdges(),
      ]);
      setNodes(nodesData);
      setEdges(edgesData);
    } catch (err: any) {
      setError(`加载图谱失败: ${err.message || '网络错误'}`);
    } finally {
      setLoading(false);
    }
  }

  // 1. 核心的社区聚类布局计算逻辑 (Louvain Clustering Space Layout)
  const nodePositions = useMemo(() => {
    const posMap: Record<string, { x: number; y: number }> = {};
    if (nodes.length === 0) return posMap;

    // 按社区分类
    const communities: Record<string, string[]> = {};
    nodes.forEach((n) => {
      const cId = n.community || 'unclustered';
      if (!communities[cId]) communities[cId] = [];
      communities[cId].push(n.id);
    });

    const cIds = Object.keys(communities);
    const numCommunities = cIds.length;

    // 分配每个社区的中心点 (圆环状排布聚类中心)
    const centerX = 350;
    const centerY = 280;
    const clusterRadius = Math.max(160, numCommunities * 50);

    const communityCenters: Record<string, { x: number; y: number }> = {};
    cIds.forEach((cId, idx) => {
      const angle = (idx / numCommunities) * 2 * Math.PI;
      communityCenters[cId] = {
        x: centerX + clusterRadius * Math.cos(angle),
        y: centerY + clusterRadius * Math.sin(angle),
      };
    });

    // 为每个社区内的节点计算局部的星状分布
    cIds.forEach((cId) => {
      const nodeIds = communities[cId];
      const center = communityCenters[cId];
      const nItems = nodeIds.length;

      nodeIds.forEach((id, idx) => {
        if (nItems === 1) {
          posMap[id] = { x: center.x, y: center.y };
        } else {
          // 星形围绕中心
          const angle = (idx / nItems) * 2 * Math.PI;
          const nodeRadius = 50 + Math.min(10 * nItems, 40); // 节点离中心距离
          posMap[id] = {
            x: center.x + nodeRadius * Math.cos(angle),
            y: center.y + nodeRadius * Math.sin(angle),
          };
        }
      });
    });

    return posMap;
  }, [nodes]);

  // 2. 平移缩放事件处理
  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if ((e.target as HTMLElement).tagName === 'circle' || (e.target as HTMLElement).tagName === 'text') {
      return; // 选中节点时不平移
    }
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!isPanning) return;
    setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  }

  function handleMouseUp() {
    setIsPanning(false);
  }

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const nextZoom = e.deltaY < 0 ? Math.min(zoom + 0.1, 2) : Math.max(zoom - 0.1, 0.3);
    setZoom(nextZoom);
  }

  // 3. 弹窗提交
  async function handleAddNode() {
    let parsedProps = {};
    try {
      parsedProps = JSON.parse(newNodePropsText);
    } catch {
      alert('属性 JSON 格式错误');
      return;
    }
    try {
      const added = await api.upsertGraphNode({
        name: newNodeName,
        component_type: newNodeType,
        properties: parsedProps,
      });
      setNodes([added, ...nodes]);
      setNodeDialogOpen(false);
      setNewNodeName('');
      setNewNodePropsText('{\n  "brand": "Siemens"\n}');
    } catch (err: any) {
      alert(`创建失败: ${err.message || '网络错误'}`);
    }
  }

  async function handleAddEdge() {
    if (!newEdgeSource || !newEdgeTarget) {
      alert('请选择源节点和目标节点');
      return;
    }
    if (newEdgeSource === newEdgeTarget) {
      alert('源节点和目标节点不能相同');
      return;
    }
    let parsedProps = {};
    try {
      parsedProps = JSON.parse(newEdgePropsText);
    } catch {
      alert('属性 JSON 格式错误');
      return;
    }
    try {
      const added = await api.createGraphEdge({
        source_id: newEdgeSource,
        target_id: newEdgeTarget,
        relation: newEdgeRelation,
        properties: parsedProps,
      });
      setEdges([added, ...edges]);
      setEdgeDialogOpen(false);
      setNewEdgeSource('');
      setNewEdgeTarget('');
      setNewEdgePropsText('{}');
    } catch (err: any) {
      alert(`建立关系失败: ${err.message || '网络错误'}`);
    }
  }

  async function handleDeleteNode(nodeId: string) {
    if (!confirm('确定要删除该元器件节点吗？相关的连接边也将被同时级联清理！')) return;
    try {
      await api.deleteGraphNode(nodeId);
      setNodes(nodes.filter((n) => n.id !== nodeId));
      setEdges(edges.filter((e) => e.source_id !== nodeId && e.target_id !== nodeId));
      setSelectedNode(null);
    } catch (err: any) {
      alert(`删除失败: ${err.message}`);
    }
  }

  // 获取社区颜色
  function getCommunityColor(node: GraphNode) {
    if (!node.community || node.community === 'unclustered') return '#64748B'; // Slate 500
    const hash = node.community.split(' ').pop() || '0';
    const idx = parseInt(hash) || 0;
    return COMMUNITY_PALETTE[idx % COMMUNITY_PALETTE.length];
  }

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* 顶部工具栏 */}
      <Box
        sx={{
          px: 3,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          bgcolor: 'rgba(20,24,29,0.3)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary' }}>
            图谱节点: <span style={{ color: '#fff' }}>{nodes.length}</span> · 关系边: <span style={{ color: '#fff' }}>{edges.length}</span>
          </Typography>
          <IconButton size="small" onClick={loadGraphData} disabled={loading} title="刷新图谱">
            <RefreshIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="contained"
            onClick={() => setNodeDialogOpen(true)}
            sx={{ fontSize: '0.75rem', py: 0.5, fontWeight: 700 }}
          >
            + 新增元器件
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => setEdgeDialogOpen(true)}
            sx={{ fontSize: '0.75rem', py: 0.5, fontWeight: 700 }}
          >
            + 建立关系
          </Button>
        </Box>
      </Box>

      {/* 画布与详情双栏 */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* SVG 画布 */}
        <Box
          sx={{
            flex: 1,
            height: '100%',
            position: 'relative',
            bgcolor: '#080a0d',
            cursor: isPanning ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        >
          {loading && (
            <Typography sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'text.disabled', fontSize: '0.8rem', zIndex: 10 }}>
              正在加载并分析图谱拓扑...
            </Typography>
          )}

          {error && (
            <Typography sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'error.main', fontSize: '0.8rem', zIndex: 10 }}>
              {error}
            </Typography>
          )}

          <svg
            width="100%"
            height="100%"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            style={{ display: 'block' }}
          >
            {/* 网格背景 */}
            <defs>
              <pattern id="graph-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              </pattern>
              {/* 各类型箭头定义 */}
              {Object.keys(RELATION_COLORS).map((rel) => (
                <marker
                  key={rel}
                  id={`arrow-${rel}`}
                  markerWidth="8"
                  markerHeight="6"
                  refX="18"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L8,3 L0,6 Z" fill={RELATION_COLORS[rel]} />
                </marker>
              ))}
            </defs>
            <rect width="100%" height="100%" fill="url(#graph-grid)" />

            {/* 平移缩放包络组 */}
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* 绘制关系边 */}
              {edges.map((edge) => {
                const src = nodePositions[edge.source_id];
                const tgt = nodePositions[edge.target_id];
                if (!src || !tgt) return null;

                const color = RELATION_COLORS[edge.relation] || '#64748B';
                return (
                  <g key={edge.id} className="graph-edge-group">
                    <line
                      x1={src.x}
                      y1={src.y}
                      x2={tgt.x}
                      y2={tgt.y}
                      stroke={color}
                      strokeWidth="1.5"
                      strokeDasharray={edge.confidence === 'inferred' ? '4 3' : 'none'}
                      markerEnd={`url(#arrow-${edge.relation})`}
                      style={{ opacity: 0.65, transition: 'all 0.2s' }}
                    />
                    {/* 关系文字 */}
                    <text
                      x={(src.x + tgt.x) / 2}
                      y={(src.y + tgt.y) / 2 - 4}
                      fill={color}
                      fontSize="7"
                      fontFamily='"JetBrains Mono", monospace'
                      textAnchor="middle"
                      style={{
                        opacity: 0.7,
                        paintOrder: 'stroke',
                        stroke: '#080a0d',
                        strokeWidth: 2,
                        strokeLinejoin: 'round',
                      }}
                    >
                      {edge.relation.replace('REQUIRES_', '').replace('COMPATIBLE_WITH', '兼容').replace('ALTERNATIVE_TO', '替代')}
                    </text>
                  </g>
                );
              })}

              {/* 绘制节点 */}
              {nodes.map((node) => {
                const pos = nodePositions[node.id];
                if (!pos) return null;

                const color = getCommunityColor(node);
                const isSelected = selectedNode?.id === node.id;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNode(node);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      r="10"
                      fill="#0b0d10"
                      stroke={color}
                      strokeWidth={isSelected ? 3.5 : 2}
                      style={{
                        transition: 'stroke-width 150ms',
                        filter: isSelected ? 'drop-shadow(0px 0px 6px rgba(78,201,255,0.4))' : 'none',
                      }}
                    />
                    <circle r="4" fill={color} />
                    <text
                      y="-16"
                      fill="#fff"
                      fontSize="9"
                      fontWeight={isSelected ? 700 : 500}
                      textAnchor="middle"
                      style={{
                        paintOrder: 'stroke',
                        stroke: '#080a0d',
                        strokeWidth: 2.5,
                        strokeLinejoin: 'round',
                      }}
                    >
                      {node.name}
                    </text>
                    <text
                      y="20"
                      fill="rgba(255,255,255,0.4)"
                      fontSize="6"
                      fontFamily='"JetBrains Mono", monospace'
                      textAnchor="middle"
                    >
                      {node.component_type}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </Box>

        {/* 侧边 Node 详情 / Properties JSON 面板 */}
        {selectedNode && (
          <Paper
            variant="outlined"
            sx={{
              width: 260,
              height: '100%',
              borderLeft: '1px solid',
              borderColor: 'divider',
              borderRadius: 0,
              bgcolor: '#0a0d11',
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              flexShrink: 0,
              overflowY: 'auto',
            }}
          >
            <Box>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, mb: 1, color: '#fff' }}>
                元器件详情
              </Typography>
              <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)', pb: 1, mb: 2 }}>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>名称</Typography>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'primary.light' }}>
                  {selectedNode.name}
                </Typography>
              </Box>
              <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)', pb: 1, mb: 2 }}>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>工业类别</Typography>
                <Chip
                  label={selectedNode.component_type}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.625rem',
                    bgcolor: 'rgba(78,201,255,0.12)',
                    color: '#4ec9ff',
                    fontWeight: 700,
                  }}
                />
              </Box>
              {selectedNode.community && (
                <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)', pb: 1, mb: 2 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>Louvain 社区聚类</Typography>
                  <Typography sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: getCommunityColor(selectedNode) }}>
                    {selectedNode.community}
                  </Typography>
                </Box>
              )}
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', mb: 0.5 }}>属性数据 (JSON)</Typography>
                <Box
                  component="pre"
                  sx={{
                    p: 1.5,
                    bgcolor: '#05070a',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: 1.5,
                    fontSize: '0.7rem',
                    fontFamily: '"JetBrains Mono", monospace',
                    color: 'rgba(255,255,255,0.7)',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {JSON.stringify(selectedNode.properties, null, 2)}
                </Box>
              </Box>
            </Box>

            <Box sx={{ pt: 2, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <Button
                fullWidth
                variant="outlined"
                color="error"
                size="small"
                onClick={() => handleDeleteNode(selectedNode.id)}
                sx={{
                  fontSize: '0.75rem',
                  py: 0.5,
                  borderColor: 'rgba(239,68,68,0.3)',
                  color: '#f87171',
                  '&:hover': { bgcolor: 'rgba(239,68,68,0.08)', borderColor: '#f87171' },
                }}
              >
                删除元器件
              </Button>
            </Box>
          </Paper>
        )}
      </Box>

      {/* 新增元器件对话框 */}
      <Dialog open={nodeDialogOpen} onClose={() => setNodeDialogOpen(false)} PaperProps={{ sx: { bgcolor: '#0b0d10', border: '1px solid rgba(255,255,255,0.1)' } }}>
        <DialogTitle sx={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>新增元器件节点</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            label="元器件名称 (如: Siemens S7-1200)"
            fullWidth
            variant="outlined"
            size="small"
            value={newNodeName}
            onChange={(e) => setNewNodeName(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="器件类别"
            fullWidth
            select
            variant="outlined"
            size="small"
            value={newNodeType}
            onChange={(e) => setNewNodeType(e.target.value)}
            sx={{ mb: 2 }}
          >
            {['PLC', 'HMI', 'Contactor', 'OverloadRelay', 'CircuitBreaker', 'VFD', 'Sensor', 'PowerSupply', 'SafetyRelay'].map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </TextField>
          <TextField
            margin="dense"
            label="参数属性 (JSON)"
            fullWidth
            multiline
            rows={4}
            variant="outlined"
            size="small"
            value={newNodePropsText}
            onChange={(e) => setNewNodePropsText(e.target.value)}
            InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.75rem' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNodeDialogOpen(false)} size="small" sx={{ color: 'text.disabled' }}>取消</Button>
          <Button onClick={handleAddNode} disabled={!newNodeName.trim()} variant="contained" size="small">保存</Button>
        </DialogActions>
      </Dialog>

      {/* 建立关系对话框 */}
      <Dialog open={edgeDialogOpen} onClose={() => setEdgeDialogOpen(false)} PaperProps={{ sx: { bgcolor: '#0b0d10', border: '1px solid rgba(255,255,255,0.1)' } }}>
        <DialogTitle sx={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>建立元器件关系</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            label="源元器件 (Source)"
            fullWidth
            select
            variant="outlined"
            size="small"
            value={newEdgeSource}
            onChange={(e) => setNewEdgeSource(e.target.value)}
            sx={{ mb: 2 }}
          >
            {nodes.map((n) => (
              <MenuItem key={n.id} value={n.id}>{n.name} ({n.component_type})</MenuItem>
            ))}
          </TextField>
          <TextField
            margin="dense"
            label="目标元器件 (Target)"
            fullWidth
            select
            variant="outlined"
            size="small"
            value={newEdgeTarget}
            onChange={(e) => setNewEdgeTarget(e.target.value)}
            sx={{ mb: 2 }}
          >
            {nodes.map((n) => (
              <MenuItem key={n.id} value={n.id}>{n.name} ({n.component_type})</MenuItem>
            ))}
          </TextField>
          <TextField
            margin="dense"
            label="关系类型 (Relation)"
            fullWidth
            select
            variant="outlined"
            size="small"
            value={newEdgeRelation}
            onChange={(e) => setNewEdgeRelation(e.target.value)}
            sx={{ mb: 2 }}
          >
            {Object.keys(RELATION_COLORS).map((r) => (
              <MenuItem key={r} value={r}>{r}</MenuItem>
            ))}
          </TextField>
          <TextField
            margin="dense"
            label="关系附加属性 (JSON)"
            fullWidth
            multiline
            rows={2}
            variant="outlined"
            size="small"
            value={newEdgePropsText}
            onChange={(e) => setNewEdgePropsText(e.target.value)}
            InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.75rem' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdgeDialogOpen(false)} size="small" sx={{ color: 'text.disabled' }}>取消</Button>
          <Button onClick={handleAddEdge} disabled={!newEdgeSource || !newEdgeTarget} variant="contained" size="small">建立</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
