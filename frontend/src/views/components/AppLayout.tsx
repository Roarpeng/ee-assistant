import { useState } from 'react';
import { ChatPanel } from './ChatPanel';
import { CanvasPanel } from './CanvasPanel';
import { KnowledgePanel } from './KnowledgePanel';
import { ThemeToggle } from './ThemeToggle';

export function AppLayout() {
  const [leftTab, setLeftTab] = useState<'chat' | 'knowledge'>('chat');
  const [leftWidth, setLeftWidth] = useState(30);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);

  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-[var(--color-bg-primary)]"
      onMouseMove={(e) => {
        if (!isDragging) return;
        const pct = (e.clientX / window.innerWidth) * 100;
        setLeftWidth(Math.max(20, Math.min(50, pct)));
      }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className="flex flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
        style={{ width: `${leftWidth}%`, minWidth: 280 }}
      >
        <div className="flex items-center border-b border-[var(--color-border)]">
          <button
            onClick={() => setLeftTab('chat')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              leftTab === 'chat'
                ? 'bg-[var(--color-bg-primary)] border-b-2 border-[var(--color-accent)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setLeftTab('knowledge')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              leftTab === 'knowledge'
                ? 'bg-[var(--color-bg-primary)] border-b-2 border-[var(--color-accent)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Knowledge
          </button>
          <ThemeToggle />
        </div>
        <div className="flex-1 overflow-hidden">
          {leftTab === 'chat' ? <ChatPanel /> : <KnowledgePanel />}
        </div>
      </div>

      <div
        className="w-1 cursor-col-resize hover:bg-[var(--color-accent)] transition-colors shrink-0"
        onMouseDown={handleMouseDown}
      />

      <div className="flex-1 flex flex-col bg-[var(--color-bg-primary)]">
        <CanvasPanel />
      </div>
    </div>
  );
}
