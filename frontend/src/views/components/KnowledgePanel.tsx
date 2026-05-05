import { useEffect, useRef, useState } from 'react';
import { useStore, type KnowledgeDoc, type KnowledgeDocStatus } from '../../models/store';
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

const TERMINAL_STATUSES: KnowledgeDocStatus[] = ['ready', 'error'];

function isTerminal(status: KnowledgeDocStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
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
      if (res.ok) {
        const newDoc: KnowledgeDoc = await res.json();
        setDocs([newDoc, ...docs]);
        connectProgress(newDoc.id);
      } else {
        const errText = await res.text();
        setUploadError(`Upload failed: ${res.status} ${errText}`);
      }
    } catch (e: any) {
      setUploadError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 shrink-0">
                    PDF
                  </span>
                  <h4 className="text-sm font-medium text-neutral-200 truncate">{doc.filename}</h4>
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
      <div className="p-6 border-t border-neutral-800 shrink-0">
        {uploadError && (
          <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{uploadError}</div>
        )}
        <input
          id="knowledge-file-upload"
          name="knowledge-file-upload"
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-neutral-600 rounded-xl text-sm font-bold text-neutral-300 transition-all border-dashed flex justify-center items-center gap-2 disabled:opacity-50"
        >
          {uploading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
          {uploading ? tr.knowledge.status.uploading : tr.knowledge.upload}
        </button>
      </div>
    </div>
  );
}
