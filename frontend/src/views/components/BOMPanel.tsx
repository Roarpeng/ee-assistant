import { useState } from 'react';
import { Download, Search, Filter, ExternalLink, Info, ThumbsDown } from 'lucide-react';
import { useStore } from '../../models/store';
import { t } from '../../services/i18n';
import { buildProcurementUrl } from '../../services/procurement';
import {
  postNegativeFeedback,
  postEditFeedback,
  type EditFeedback,
} from '../../services/feedback';
import { MemorySourcePopover } from './MemorySourcePopover';

/**
 * Maps a BOMItem onto the (category, manufacturer, model) triple the
 * memory-flywheel API expects. We use `name` as the component category
 * because the upstream BOM payload (TopologyPanel.handleConfirmTopology)
 * sets `name` from NODE_TYPE_TO_BOM, e.g. "PLC", "HMI", "变频器".
 */
function bomTriple(item: { name: string; mfg: string; pn: string }) {
  return { category: item.name, manufacturer: item.mfg, model: item.pn };
}

export function BOMPanel() {
  const bomData = useStore((s) => s.bom);
  const project = useStore((s) => s.project);
  const language = useStore((s) => s.language);
  const tr = t(language);

  const [popoverFor, setPopoverFor] = useState<{
    category: string;
    manufacturer: string;
    model: string;
  } | null>(null);
  const [negativeBusyId, setNegativeBusyId] = useState<string | null>(null);

  const projectId = project?.id ?? null;

  // Future-proof: inline BOM-row edits (qty / specs override) should call
  // this helper so they're captured as `bom_edit` decisions for the
  // selection_supervisor. No inline editor exists in BOMPanel today, so
  // this is wired but not yet invoked from any UI element. Track-A's
  // backend route is still in flight, so we swallow errors to avoid
  // breaking the table when the endpoint isn't mounted yet.
  async function recordBomEdit(before: EditFeedback['before'], after: EditFeedback['after']) {
    if (!projectId) return;
    try {
      await postEditFeedback(projectId, { target: 'bom', before, after });
    } catch {
      // Non-fatal — the table itself has already updated locally.
    }
  }
  // Mark intentional unused-export-style retention so tsc --noUnusedLocals
  // (if ever enabled) doesn't strip this scaffolding.
  void recordBomEdit;

  async function handleNegative(item: { id: string; name: string; mfg: string; pn: string }) {
    if (!projectId || negativeBusyId) return;
    setNegativeBusyId(item.id);
    try {
      await postNegativeFeedback(projectId, {
        target: 'bom_row',
        context: bomTriple(item),
      });
    } catch {
      // Non-fatal: backend route may not exist yet during M2 staged rollout.
    } finally {
      setNegativeBusyId(null);
    }
  }

  return (
    <div className="w-full h-full flex flex-col p-8 overflow-hidden rounded-[2.5rem] relative">
      <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px]" />

      <div className="flex justify-between items-start mb-8 relative z-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full mb-3">
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
              {tr.bom.title}
            </span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white">{tr.bom.title}</h2>
        </div>
        <div className="flex gap-3 mt-4">
          <button className="flex items-center gap-2 px-6 py-3 bg-white text-black text-sm font-bold rounded-2xl shadow-sm hover:scale-105 active:scale-95 transition-all">
            <Download className="w-4 h-4" />
            {tr.bom.export}
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-3 mb-6 relative z-10">
        <button className="flex items-center gap-2 px-6 py-2.5 bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm font-bold rounded-2xl hover:bg-neutral-700 transition-colors">
          {tr.bom.filter} <Filter className="w-4 h-4" />
        </button>
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            id="bom-search"
            name="bom-search"
            type="text"
            placeholder={tr.bom.search}
            className="pl-12 pr-4 py-2.5 bg-neutral-800 border border-neutral-700 text-white text-sm font-medium rounded-2xl focus:outline-none focus:border-indigo-500 w-72"
          />
        </div>
      </div>

      <div className="flex-1 bg-neutral-950 border border-neutral-800 rounded-[2rem] overflow-hidden flex flex-col relative z-10 shadow-inner">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-left text-sm text-neutral-300 whitespace-nowrap">
            <thead className="bg-neutral-900 text-neutral-400 sticky top-0 z-10 border-b border-neutral-800">
              <tr>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-indigo-400">{tr.bom.itemNo}</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">{tr.bom.component}</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">{tr.bom.manufacturer}</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">{tr.bom.partNo}</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">{tr.bom.qty}</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">{tr.bom.specs}</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">采购</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {bomData.map((item) => {
                const proc = buildProcurementUrl({ manufacturer: item.mfg, model: item.pn });
                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-neutral-800/50 transition-colors ${item.active ? 'bg-neutral-900' : ''}`}
                  >
                    <td className="px-6 py-4 text-indigo-400 font-bold">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPopoverFor(bomTriple(item))}
                          disabled={!projectId}
                          aria-label={`查看 ${item.name} ${item.mfg} ${item.pn} 的记忆来源`}
                          data-testid={`bom-info-${item.id}`}
                          className="text-app-text-tertiary hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="查看记忆来源 — 为什么 AI 推荐了这个型号"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                        <span>{item.id}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium">{item.name}</td>
                    <td className="px-6 py-4 text-neutral-400">{item.mfg}</td>
                    <td className="px-6 py-4 font-mono text-emerald-400">
                      <span className="bg-emerald-500/10 inline-block mt-2 px-2.5 py-0.5 rounded-md text-xs font-bold">
                        {item.pn}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-md bg-indigo-500/20 text-indigo-400 font-bold">
                        {item.qty}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-neutral-400">{item.specs}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {proc ? (
                          <a
                            href={proc}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-app-accent hover:text-app-accent-hover text-xs font-mono"
                            title={`在供应商目录中查找 ${item.pn}`}
                          >
                            查询 <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-neutral-600 text-xs">—</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleNegative(item)}
                          disabled={!projectId || negativeBusyId === item.id}
                          aria-label={`这个选错了 — ${item.name} ${item.mfg} ${item.pn}`}
                          data-testid={`bom-negative-${item.id}`}
                          className="text-neutral-500 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="这个选错了 — 让 AI 下次别再推荐"
                        >
                          <ThumbsDown className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {popoverFor && projectId && (
        <MemorySourcePopover
          projectId={projectId}
          category={popoverFor.category}
          manufacturer={popoverFor.manufacturer}
          model={popoverFor.model}
          onClose={() => setPopoverFor(null)}
        />
      )}
    </div>
  );
}
