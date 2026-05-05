import { useEffect, useRef } from 'react';
import { useStore } from '../../models/store';
import type { NodeData } from '../../models/store';
import { t } from '../../services/i18n';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  nodes: NodeData[];
  mode: 'single' | 'selection';
  onDismiss: () => void;
}

export function CanvasContextMenu({ x, y, nodes, mode, onDismiss }: CanvasContextMenuProps) {
  const setChatContext = useStore((s) => s.setChatContext);
  const language = useStore((s) => s.language);
  const tr = t(language);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onDismiss]);

  const handleDiscuss = () => {
    const nodeIds = nodes.map((n) => n.id);
    setChatContext({ nodeIds, mode });
    onDismiss();
  };

  const label = mode === 'single'
    ? tr.canvas.discussSingle
    : `${tr.canvas.discussSelection} (${nodes.length})`;

  let summary = nodes.slice(0, 5).map((n) => n.label).join(', ');
  if (nodes.length > 5) summary += ` +${nodes.length - 5}`;

  return (
    <div
      ref={menuRef}
      className="absolute z-50 bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl py-1.5 min-w-[220px] backdrop-blur-sm"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-2 text-[11px] text-neutral-400 border-b border-neutral-700/50 truncate max-w-[280px]">
        {summary}
      </div>
      <button
        className="w-full text-left px-3 py-2.5 text-sm text-neutral-200 hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors flex items-center gap-2"
        onClick={handleDiscuss}
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
        </svg>
        {label}
      </button>
    </div>
  );
}
