import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../models/store';

interface ConversationMeta {
  id: string;
  name: string;
  lastMessage: string;
  updatedAt: number;
}

const STORAGE_KEY = 'volta-conversations';

function loadConversations(): ConversationMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveConversations(list: ConversationMeta[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

export function ConversationSidebar() {
  const project = useStore((s) => s.project);
  const setProject = useStore((s) => s.setProject);
  const messages = useStore((s) => s.messages);
  const [conversations, setConversations] = useState<ConversationMeta[]>(loadConversations);
  const [collapsed, setCollapsed] = useState(false);

  // Update conversation list when messages change
  useEffect(() => {
    if (!project) return;
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const preview = lastMsg ? lastMsg.content.slice(0, 60) : '';
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== project.id);
      updated.unshift({
        id: project.id,
        name: project.name,
        lastMessage: preview,
        updatedAt: Date.now(),
      });
      // Keep max 30 conversations
      const trimmed = updated.slice(0, 30);
      saveConversations(trimmed);
      return trimmed;
    });
  }, [messages.length, project?.id, project?.name]);

  const handleNewConversation = useCallback(async () => {
    // newProject() saves old chat + resets all state + creates new project
    await useStore.getState().newProject();
  }, []);

  const handleSwitchConversation = useCallback(async (conv: ConversationMeta) => {
    const s = useStore.getState();
    // Save current conversation before switching
    if (s.project && s.project.id !== conv.id) {
      try {
        const raw = localStorage.getItem('volta-chat-history');
        const all: Record<string, any[]> = raw ? JSON.parse(raw) : {};
        all[s.project.id] = s.messages;
        localStorage.setItem('volta-chat-history', JSON.stringify(all));
      } catch {}
    }
    setProject({ id: conv.id, name: conv.name });
    useStore.getState().loadChatHistory();
  }, [setProject]);

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConversations(next);
      return next;
    });
    try {
      const raw = localStorage.getItem('volta-chat-history');
      if (raw) {
        const all = JSON.parse(raw);
        delete all[id];
        localStorage.setItem('volta-chat-history', JSON.stringify(all));
      }
    } catch {}
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
          onClick={handleNewConversation}
          className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold"
          title="新对话"
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div className="w-56 flex-shrink-0 flex flex-col bg-neutral-900 border-r border-neutral-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-neutral-800 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">历史对话</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-neutral-500 hover:text-neutral-300 text-xs"
          title="收起"
        >
          &lt;
        </button>
      </div>

      {/* New Conversation Button */}
      <div className="p-2 shrink-0">
        <button
          onClick={handleNewConversation}
          className="w-full py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
        >
          + 新对话
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
        {conversations.map((conv) => (
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
              {new Date(conv.updatedAt).toLocaleDateString()}
            </div>
          </div>
        ))}
        {conversations.length === 0 && (
          <div className="text-[10px] text-neutral-600 text-center py-8 px-2">
            暂无历史对话。<br/>点击"+ 新对话"开始
          </div>
        )}
      </div>
    </div>
  );
}
