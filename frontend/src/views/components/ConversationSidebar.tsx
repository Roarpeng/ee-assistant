import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../../models/store';
import {
  deleteConversationHistory,
  deriveConversationTitle,
  loadConversationMetas,
  saveConversationMessages,
  saveConversationMetas,
  type ConversationMeta,
} from '../../services/conversations';

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return new Date(timestamp).toLocaleDateString();
}

export function ConversationSidebar() {
  const project = useStore((s) => s.project);
  const setProject = useStore((s) => s.setProject);
  const messages = useStore((s) => s.messages);
  const [conversations, setConversations] = useState<ConversationMeta[]>(loadConversationMetas);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [showNewMenu, setShowNewMenu] = useState(false);

  // Update conversation list when messages change
  useEffect(() => {
    if (!project) return;
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const preview = lastMsg ? lastMsg.content.slice(0, 60) : '';
    const autoTitle = deriveConversationTitle(messages, project.name || '新对话');
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== project.id);
      updated.unshift({
        id: project.id,
        name: autoTitle,
        lastMessage: preview,
        updatedAt: Date.now(),
      });
      // Keep max 30 conversations
      const trimmed = updated.slice(0, 30);
      saveConversationMetas(trimmed);
      return trimmed;
    });
  }, [messages.length, project?.id, project?.name]);

  const filteredConversations = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return conversations;
    return conversations.filter((conv) =>
      [conv.name, conv.lastMessage].some((value) => value.toLowerCase().includes(keyword))
    );
  }, [conversations, search]);

  const handleNewConversation = useCallback(async (preserveCanvas: boolean) => {
    setShowNewMenu(false);
    await useStore.getState().newProject({ preserveCanvas });
  }, []);

  const handleSwitchConversation = useCallback(async (conv: ConversationMeta) => {
    const s = useStore.getState();
    // Save current conversation before switching
    if (s.project && s.project.id !== conv.id) {
      saveConversationMessages(s.project.id, s.messages);
    }
    setProject({ id: conv.id, name: conv.name });
    useStore.getState().loadChatHistory();
  }, [setProject]);

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConversationMetas(next);
      return next;
    });
    deleteConversationHistory(id);
  }, []);

  if (collapsed) {
    return (
      <div className="w-10 flex-shrink-0 flex flex-col items-center pt-4 gap-2 bg-neutral-900 border-r border-neutral-800">
        <button
          onClick={() => setCollapsed(false)}
          className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs"
          title="展开对话列表"
        >
          &gt;
        </button>
        <button
          onClick={() => handleNewConversation(false)}
          className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold"
          title="新对话"
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 flex-shrink-0 flex flex-col bg-neutral-900 border-r border-neutral-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-neutral-800 shrink-0">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">历史对话</span>
          <div className="text-[10px] text-neutral-600 mt-0.5">可搜索、自动命名、继续上下文</div>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-neutral-500 hover:text-neutral-300 text-xs"
          title="收起"
        >
          &lt;
        </button>
      </div>

      {/* New Conversation Button */}
      <div className="p-2 shrink-0 border-b border-neutral-800/70">
        <div className="relative">
          <button
            onClick={() => setShowNewMenu((v) => !v)}
            className="w-full py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors shadow-lg shadow-indigo-950/30"
          >
            + 新对话
          </button>
          {showNewMenu && (
            <div className="absolute z-20 top-11 left-0 right-0 rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl p-1.5">
              <button
                onClick={() => handleNewConversation(false)}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-800 transition-colors"
              >
                <div className="text-xs font-bold text-neutral-200">清空画布开始</div>
                <div className="text-[10px] text-neutral-500 mt-0.5">新需求、新拓扑和新 BOM</div>
              </button>
              <button
                onClick={() => handleNewConversation(true)}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-800 transition-colors"
              >
                <div className="text-xs font-bold text-neutral-200">沿用当前画布继续</div>
                <div className="text-[10px] text-neutral-500 mt-0.5">保留拓扑、BOM 和代码，仅开启新对话</div>
              </button>
            </div>
          )}
        </div>
        <div className="mt-2 relative">
          <span className="absolute left-3 top-2.5 text-neutral-600 text-xs">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索对话..."
            className="w-full rounded-xl bg-neutral-950 border border-neutral-800 py-2 pl-7 pr-3 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
        {filteredConversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => handleSwitchConversation(conv)}
            className={`group px-3 py-2 rounded-xl cursor-pointer transition-colors text-left w-full ${
              project?.id === conv.id
                ? 'bg-indigo-500/10 border border-indigo-500/20'
                : 'hover:bg-neutral-800 border border-transparent'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-300 truncate flex-1">
                {conv.name}
              </span>
              <button
                onClick={(e) => handleDelete(e, conv.id)}
                className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-rose-400 ml-1 shrink-0 text-[10px]"
                title="删除"
              >
                x
              </button>
            </div>
            <div className="text-[10px] text-neutral-500 truncate mt-0.5">
              {conv.lastMessage || '新对话'}
            </div>
            <div className="text-[9px] text-neutral-600 mt-0.5">
              {formatRelativeTime(conv.updatedAt)}
            </div>
          </div>
        ))}
        {filteredConversations.length === 0 && (
          <div className="text-[10px] text-neutral-600 text-center py-8 px-2">
            {search ? '没有匹配的历史对话。' : <>暂无历史对话。<br/>点击"+ 新对话"开始</>}
          </div>
        )}
      </div>
    </div>
  );
}
