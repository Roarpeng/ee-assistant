import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../models/store';
import { t } from '../../services/i18n';
import { ChatPanel } from './ChatPanel';
import { TopologyPanel } from './TopologyPanel';
import { BOMPanel } from './BOMPanel';
import { SCLPanel } from './SCLPanel';
import { SettingsModal } from './SettingsModal';
import { KnowledgePanel } from './KnowledgePanel';
import { ConversationSidebar } from './ConversationSidebar';
import { InfoPanel } from './InfoPanel';
import { WiringPanel } from './WiringPanel';
import { GuidePanel } from './GuidePanel';
import { Settings, Sun, Moon, Languages, PenTool } from 'lucide-react';

export function AppLayout() {
  const activeCanvasTab = useStore((s) => s.activeCanvasTab);
  const setActiveCanvasTab = useStore((s) => s.setActiveCanvasTab);
  const language = useStore((s) => s.language);
  const tr = t(language);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const toggleLanguage = useStore((s) => s.toggleLanguage);

  const unreadChatCount = useStore((s) => s.unreadChatCount);
  const resetUnread = useStore((s) => s.resetUnread);

  const [centerTab, setCenterTab] = useState<'chat' | 'knowledge'>('chat');
  const [chatWidth, setChatWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('volta-chat-width');
      return saved ? Number(saved) : 380;
    } catch {
      return 380;
    }
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isDragging = useRef(false);
  const chatWidthRef = useRef(chatWidth);
  chatWidthRef.current = chatWidth;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const sidebarWidth = 280; // sidebar ~256px + padding
      const minCanvasWidth = 350; // leave at least 350px for canvas
      const minChatWidth = 250;
      const maxChatWidth = window.innerWidth - sidebarWidth - minCanvasWidth;
      const newWidth = e.clientX - sidebarWidth;
      if (newWidth > minChatWidth && newWidth < maxChatWidth) {
        setChatWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = 'default';
        document.body.classList.remove('select-none');
        try { localStorage.setItem('volta-chat-width', String(chatWidthRef.current)); } catch {}
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const canvasTabs: [string, string][] = [
    ['info', tr.header.info],
    ['topology', tr.header.topology],
    ['wiring', tr.header.wiring],
    ['bom', tr.header.bom],
    ['code', tr.header.code],
    ['guide', tr.header.guide],
  ];

  return (
    <div className="flex h-screen bg-app-bg-primary text-app-text-primary font-sans p-4 gap-4 overflow-hidden relative">
      {/* Left: Conversation Sidebar */}
      <ConversationSidebar />

      {/* Chat / Knowledge panel (fixed width, resizable) */}
      <div style={{ width: chatWidth }} className="flex-shrink-0 flex flex-col min-w-0">
        <div className="w-full flex flex-col bg-app-bg-secondary border border-app-border rounded-lg h-full overflow-hidden shadow-xl">
          {/* Chat header: brand + tabs + controls */}
          <div className="flex items-center justify-between px-6 pt-5 pb-0 border-b border-app-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-app-accent rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <span className="text-app-text-primary font-bold tracking-tighter text-xs">V</span>
              </div>
              <span className="text-lg font-bold tracking-tight uppercase">{tr.app.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleLanguage}
                className="w-8 h-8 bg-app-bg-secondary hover:bg-app-bg-tertiary border border-app-border rounded-full flex items-center justify-center text-app-text-secondary hover:text-app-text-primary transition-colors"
                title={language === 'zh' ? 'Switch to English' : '切换到中文'}
              >
                <Languages className="w-3.5 h-3.5" />
                <span className="text-[9px] font-bold ml-0.5">{language === 'zh' ? 'EN' : '中'}</span>
              </button>
              <button
                onClick={toggleTheme}
                className="w-8 h-8 bg-app-bg-secondary hover:bg-app-bg-tertiary border border-app-border rounded-full flex items-center justify-center text-app-text-secondary hover:text-app-text-primary transition-colors"
                title={
                  theme === 'light'
                    ? 'Switch to dark mode'
                    : theme === 'dark'
                    ? 'Switch to engineering mode'
                    : 'Switch to light mode'
                }
              >
                {theme === 'light' ? (
                  <Moon className="w-3.5 h-3.5" />
                ) : theme === 'dark' ? (
                  <PenTool className="w-3.5 h-3.5" />
                ) : (
                  <Sun className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="w-8 h-8 bg-app-bg-secondary hover:bg-app-bg-tertiary border border-app-border rounded-full flex items-center justify-center text-app-text-secondary hover:text-app-text-primary transition-colors"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Chat / Knowledge tab buttons */}
          <div className="flex px-6 pt-3 gap-2 shrink-0">
            <button
              className={`pb-3 px-3 text-sm font-bold uppercase tracking-wide border-b-[3px] transition-colors relative ${
                centerTab === 'chat'
                  ? 'border-indigo-500 text-app-accent'
                  : 'border-transparent text-app-text-tertiary hover:text-app-text-secondary'
              }`}
              onClick={() => { setCenterTab('chat'); resetUnread(); }}
            >
              {tr.chat.tab}
              {unreadChatCount > 0 && centerTab !== 'chat' && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-app-bg-secondary" />
              )}
            </button>
            <button
              className={`pb-3 px-3 text-sm font-bold uppercase tracking-wide border-b-[3px] transition-colors ${
                centerTab === 'knowledge'
                  ? 'border-indigo-500 text-app-accent'
                  : 'border-transparent text-app-text-tertiary hover:text-app-text-secondary'
              }`}
              onClick={() => setCenterTab('knowledge')}
            >
              {tr.chat.knowledge}
            </button>
          </div>

          {/* Chat/Knowledge content */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {centerTab === 'chat' ? <ChatPanel /> : <KnowledgePanel />}
          </div>
        </div>
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
        <div className="w-1 h-12 bg-app-bg-tertiary/50 rounded-full group-hover:bg-app-accent group-active:bg-app-accent-hover transition-colors shadow-sm" />
      </div>

      {/* Right: Canvas Workspace (flex-1, takes remaining space) */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Canvas header with tabs */}
        <header className="h-[56px] flex items-center justify-between px-6 bg-app-bg-secondary border border-app-border rounded-lg shrink-0 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-app-bg-tertiary/50 rounded-full">
              <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-app-text-secondary uppercase tracking-widest">
                {tr.header.version}
              </span>
            </div>
          </div>

          <nav className="flex bg-app-bg-primary border border-app-border rounded-full px-2 py-1 gap-1 text-xs font-bold text-app-text-tertiary h-[40px]">
            {canvasTabs.map(([id, label]) => (
              <button
                key={id}
                onClick={() =>
                  setActiveCanvasTab(
                    id as 'info' | 'topology' | 'wiring' | 'bom' | 'code' | 'guide'
                  )
                }
                className={`px-4 h-full flex items-center rounded-full transition-all tracking-wide ${
                  activeCanvasTab === id
                    ? 'bg-app-bg-tertiary text-app-text-primary shadow-sm'
                    : 'hover:text-app-text-primary hover:bg-app-bg-tertiary/50'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="w-[72px]" />
        </header>

        <main className="flex-1 mt-4 overflow-hidden relative border border-app-border rounded-lg bg-app-bg-secondary shadow-xl">
          <div className={activeCanvasTab === 'info' ? 'h-full' : 'hidden h-full'}>
            <InfoPanelMount />
          </div>
          <div className={activeCanvasTab === 'topology' ? 'h-full' : 'hidden h-full'}>
            <TopologyPanel />
          </div>
          <div className={activeCanvasTab === 'wiring' ? 'h-full' : 'hidden h-full'}>
            <WiringPanelMount />
          </div>
          <div className={activeCanvasTab === 'bom' ? 'h-full' : 'hidden h-full'}>
            <BOMPanel />
          </div>
          <div className={activeCanvasTab === 'code' ? 'h-full' : 'hidden h-full'}>
            <SCLPanel />
          </div>
          <div className={activeCanvasTab === 'guide' ? 'h-full' : 'hidden h-full'}>
            <GuidePanelMount />
          </div>
        </main>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}

// ---------- Adapters: pull from the global store, hand off to pure panels ----

function InfoPanelMount() {
  const project = useStore((s) => s.project);
  const nodes = useStore((s) => s.topology.nodes);
  const bomCost = useStore((s) => s.bomCost);
  const safetyLevel = useStore((s) => s.safetyLevel);
  const components = nodes.map((n) => ({ id: n.id, label: n.label, type: n.type }));
  return (
    <InfoPanel
      projectName={project?.name ?? ''}
      safetyLevel={safetyLevel}
      bomCost={bomCost}
      components={components}
      nodes={nodes}
    />
  );
}

function WiringPanelMount() {
  const ioItems = useStore((s) => s.ioItems);
  return <WiringPanel ioItems={ioItems} />;
}

function GuidePanelMount() {
  const steps = useStore((s) => s.commissioningSteps);
  return <GuidePanel steps={steps} />;
}
