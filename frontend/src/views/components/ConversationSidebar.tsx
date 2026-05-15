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
import { listTemplates, type Template } from '../../services/templates';
import { OrgSettingsPanel } from './OrgSettingsPanel';

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
  const [showOrgSettings, setShowOrgSettings] = useState(false);

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

  const handleFromTemplate = useCallback(async (template: Template) => {
    setShowNewMenu(false);
    await useStore.getState().newProject({
      preserveCanvas: false,
      seedPrompt: template.seedPrompt,
    });
  }, []);

  const templates = useMemo(() => listTemplates(), []);

  const handleSwitchConversation = useCallback(async (conv: ConversationMeta) => {
    const s = useStore.getState();
    // Save current conversation before switching
    if (s.project && s.project.id !== conv.id) {
      saveConversationMessages(s.project.id, s.messages);
    }
    setProject({ id: conv.id, name: conv.name });
    await useStore.getState().loadChatHistory(conv.id);
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
      <div className="w-10 flex-shrink-0 flex flex-col items-center pt-4 gap-2 bg-app-bg-secondary border-r border-app-border">
        <button
          onClick={() => setCollapsed(false)}
          className="w-7 h-7 rounded-lg bg-app-bg-tertiary hover:bg-app-bg-tertiary text-app-text-secondary text-xs"
          title="展开对话列表"
        >
          &gt;
        </button>
        <button
          onClick={() => handleNewConversation(false)}
          className="w-7 h-7 rounded-lg bg-app-accent hover:bg-app-accent-hover text-app-text-primary text-sm font-bold"
          title="新对话"
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 flex-shrink-0 flex flex-col bg-app-bg-secondary border-r border-app-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-app-border shrink-0">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-app-text-tertiary">历史对话</span>
          <div className="text-[10px] text-app-text-tertiary mt-0.5">可搜索、自动命名、继续上下文</div>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-app-text-tertiary hover:text-app-text-secondary text-xs"
          title="收起"
        >
          &lt;
        </button>
      </div>

      {/* New Conversation Button */}
      <div className="p-2 shrink-0 border-b border-app-border/70">
        <div className="relative">
          <button
            onClick={() => setShowNewMenu((v) => !v)}
            className="w-full py-2.5 text-xs font-bold bg-app-accent hover:bg-app-accent-hover text-app-text-primary rounded-xl transition-colors shadow-lg shadow-indigo-950/30"
          >
            + 新对话
          </button>
          {showNewMenu && (
            <div className="absolute z-20 top-11 left-0 right-0 rounded-md border border-app-border bg-app-bg-primary shadow-2xl p-1.5 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <button
                onClick={() => handleNewConversation(false)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-app-bg-tertiary transition-colors"
              >
                <div className="text-xs font-bold text-app-text-primary">清空画布开始</div>
                <div className="text-[10px] text-app-text-tertiary mt-0.5">新需求、新拓扑和新 BOM</div>
              </button>
              <button
                onClick={() => handleNewConversation(true)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-app-bg-tertiary transition-colors"
              >
                <div className="text-xs font-bold text-app-text-primary">沿用当前画布继续</div>
                <div className="text-[10px] text-app-text-tertiary mt-0.5">保留拓扑、BOM 和代码，仅开启新对话</div>
              </button>
              <div className="mt-1 pt-1 border-t border-app-border-light">
                <div className="px-3 py-1 text-[9px] font-mono uppercase tracking-widest text-app-text-tertiary">
                  从行业模板开始
                </div>
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => handleFromTemplate(tpl)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-app-bg-tertiary transition-colors"
                  >
                    <div className="text-xs font-bold text-app-text-primary">{tpl.name}</div>
                    <div className="text-[10px] text-app-text-tertiary mt-0.5 line-clamp-2">
                      {tpl.summary}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mt-2 relative">
          <span className="absolute left-3 top-2.5 text-app-text-tertiary text-xs">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索对话..."
            className="w-full rounded-xl bg-app-bg-primary border border-app-border py-2 pl-7 pr-3 text-xs text-app-text-primary placeholder:text-app-text-tertiary focus:outline-none focus:border-indigo-500"
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
                ? 'bg-app-accent/10 border border-indigo-500/20'
                : 'hover:bg-app-bg-tertiary border border-transparent'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-app-text-secondary truncate flex-1">
                {conv.name}
              </span>
              <button
                onClick={(e) => handleDelete(e, conv.id)}
                className="opacity-0 group-hover:opacity-100 text-app-text-tertiary hover:text-rose-400 ml-1 shrink-0 text-[10px]"
                title="删除"
              >
                x
              </button>
            </div>
            <div className="text-[10px] text-app-text-tertiary truncate mt-0.5">
              {conv.lastMessage || '新对话'}
            </div>
            <div className="text-[9px] text-app-text-tertiary mt-0.5">
              {formatRelativeTime(conv.updatedAt)}
            </div>
          </div>
        ))}
        {filteredConversations.length === 0 && (
          <div className="text-[10px] text-app-text-tertiary text-center py-8 px-2">
            {search ? '没有匹配的历史对话。' : <>暂无历史对话。<br/>点击"+ 新对话"开始</>}
          </div>
        )}
      </div>

      {/* Footer — org settings entry. Anchored at the bottom of the
          sidebar so it survives long conversation lists scrolling. */}
      <div className="shrink-0 border-t border-app-border p-2">
        <button
          type="button"
          onClick={() => setShowOrgSettings(true)}
          className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-app-text-secondary hover:bg-app-bg-tertiary hover:text-app-text-primary transition-colors flex items-center justify-between"
        >
          <span>组织设置</span>
          <span className="text-app-text-tertiary text-[10px]">⚙</span>
        </button>
      </div>

      <OrgSettingsPanel
        open={showOrgSettings}
        onClose={() => setShowOrgSettings(false)}
      />
    </div>
  );
}
