import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../models/store';
import { t } from '../../services/i18n';
import { Header } from './Header';
import { ChatPanel } from './ChatPanel';
import { TopologyPanel } from './TopologyPanel';
import { BOMPanel } from './BOMPanel';
import { SCLPanel } from './SCLPanel';
import { SettingsModal } from './SettingsModal';
import { KnowledgePanel } from './KnowledgePanel';

export function AppLayout() {
  const activeCanvasTab = useStore((s) => s.activeCanvasTab);
  const setActiveCanvasTab = useStore((s) => s.setActiveCanvasTab);
  const language = useStore((s) => s.language);
  const tr = t(language);

  const unreadChatCount = useStore((s) => s.unreadChatCount);
  const resetUnread = useStore((s) => s.resetUnread);

  const [rightTab, setRightTab] = useState<'chat' | 'knowledge'>('chat');
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = window.innerWidth - e.clientX - 16;
      if (newWidth > 250 && newWidth < 800) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = 'default';
        document.body.classList.remove('select-none');
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-50 font-sans p-4 gap-4 overflow-hidden relative">
      {/* Left: Main Workspace (Canvas) */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          activeTab={activeCanvasTab}
          setActiveTab={(t) => setActiveCanvasTab(t as 'topology' | 'bom' | 'code')}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
        <main className="flex-1 mt-4 overflow-hidden relative border border-neutral-800 rounded-[2.5rem] bg-neutral-900 shadow-xl">
          <div className={activeCanvasTab === 'topology' ? 'h-full' : 'hidden h-full'}>
            <TopologyPanel />
          </div>
          <div className={activeCanvasTab === 'bom' ? 'h-full' : 'hidden h-full'}>
            <BOMPanel />
          </div>
          <div className={activeCanvasTab === 'code' ? 'h-full' : 'hidden h-full'}>
            <SCLPanel />
          </div>
        </main>
      </div>

      {/* Resizer */}
      <div
        className="w-3 relative mx-[-8px] z-10 flex items-center justify-center cursor-col-resize group"
        onMouseDown={(e) => {
          e.preventDefault();
          isDragging.current = true;
          document.body.style.cursor = 'col-resize';
          document.body.classList.add('select-none');
        }}
      >
        <div className="w-1 h-12 bg-neutral-700/50 rounded-full group-hover:bg-indigo-500 group-active:bg-indigo-400 transition-colors shadow-sm" />
      </div>

      {/* Right Panel: Chat / Knowledge */}
      <div style={{ width: sidebarWidth }} className="flex-shrink-0 flex flex-col">
        <div className="w-full flex flex-col bg-neutral-900 border border-neutral-800 rounded-[2.5rem] shrink-0 h-full overflow-hidden shadow-xl">
          <div className="flex border-b border-neutral-800 px-6 pt-6 gap-2 shrink-0">
            <button
              className={`pb-4 px-2 text-sm font-bold uppercase tracking-wide flex-1 border-b-[3px] transition-colors relative ${
                rightTab === 'chat'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
              onClick={() => { setRightTab('chat'); resetUnread(); }}
            >
              {tr.chat.tab}
              {unreadChatCount > 0 && rightTab !== 'chat' && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-neutral-900" />
              )}
            </button>
            <button
              className={`pb-4 px-2 text-sm font-bold uppercase tracking-wide flex-1 border-b-[3px] transition-colors ${
                rightTab === 'knowledge'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
              onClick={() => setRightTab('knowledge')}
            >
              {tr.chat.knowledge}
            </button>
          </div>
          {rightTab === 'chat' ? <ChatPanel /> : <KnowledgePanel />}
        </div>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
