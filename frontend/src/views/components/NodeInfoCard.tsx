import { useStore } from '../../models/store';
import { t } from '../../services/i18n';

const STATUS_COLORS: Record<string, string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
};

export function NodeInfoCard() {
  const topology = useStore((s) => s.topology);
  const previewNodeId = useStore((s) => s.previewNodeId);
  const setPreviewNodeId = useStore((s) => s.setPreviewNodeId);
  const setChatContext = useStore((s) => s.setChatContext);
  const language = useStore((s) => s.language);
  const tr = t(language);

  if (!previewNodeId) return null;

  const node = topology.nodes.find((n) => n.id === previewNodeId);
  if (!node) return null;

  const nodeTypeLabel = (node.type || 'COMPONENT').replace(/_/g, ' ').toUpperCase();
  const statusColor = STATUS_COLORS[node.status || 'ok'] || STATUS_COLORS.ok;

  const handleDetailChat = () => {
    setChatContext({ nodeIds: [node.id], mode: 'single' });
    setPreviewNodeId(null);
  };

  return (
    <div className="absolute bottom-4 right-4 z-40 w-72 bg-neutral-800/95 border border-neutral-700 rounded-2xl shadow-2xl backdrop-blur-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColor}`} />
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{nodeTypeLabel}</span>
        </div>
        <button
          className="text-neutral-500 hover:text-neutral-300 text-xs"
          onClick={() => setPreviewNodeId(null)}
        >
          ×
        </button>
      </div>

      <h3 className="text-sm font-bold text-white mb-2">{node.label}</h3>

      {node.details && Object.keys(node.details).length > 0 && (
        <div className="space-y-1 mb-3">
          {Object.entries(node.details).slice(0, 6).map(([k, v]) => (
            <div key={k} className="flex justify-between text-[11px]">
              <span className="text-neutral-500">{k}</span>
              <span className="text-neutral-300 font-mono">{v}</span>
            </div>
          ))}
        </div>
      )}

      <div className="text-[11px] text-neutral-500 mb-3">
        ID: <code className="text-neutral-400 font-mono">{node.id}</code> · ({node.x}, {node.y})
      </div>

      <button
        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors"
        onClick={handleDetailChat}
      >
        {tr.canvas.detailChat}
      </button>
    </div>
  );
}
