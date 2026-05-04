import { Download, Search, Filter } from 'lucide-react';
import { useStore } from '../../models/store';
import { t } from '../../services/i18n';

export function BOMPanel() {
  const bomData = useStore((s) => s.bom);
  const language = useStore((s) => s.language);
  const tr = t(language);

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
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {bomData.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-neutral-800/50 transition-colors ${item.active ? 'bg-neutral-900' : ''}`}
                >
                  <td className="px-6 py-4 text-indigo-400 font-bold">{item.id}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
