import { useStore } from '../../models/store';
import { t } from '../../services/i18n';

export function KnowledgePanel() {
  const language = useStore((s) => s.language);
  const tr = t(language);

  return (
    <div className="flex-1 flex flex-col p-0 overflow-hidden min-h-0">
      <div className="p-6 pb-2 border-b border-neutral-800 shrink-0">
        <h3 className="text-sm font-bold text-neutral-300 mb-4 tracking-wide">{tr.knowledge.title}</h3>
        <div className="relative">
          <input
            type="text"
            placeholder={tr.knowledge.search}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder:text-neutral-600 transition-colors"
          />
          <svg
            className="absolute left-3 top-3 w-4 h-4 text-neutral-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 pr-2 custom-scrollbar">
        {tr.knowledge.docs.map((doc, i) => (
          <div
            key={i}
            className="group bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-800 rounded-2xl p-4 transition-colors cursor-pointer relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/5 rounded-bl-full group-hover:bg-indigo-500/10 transition-colors" />
            <div className="flex items-start gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  doc.type === 'PDF' ? 'bg-rose-500/20 text-rose-400' : 'bg-blue-500/20 text-blue-400'
                }`}
              >
                <span className="text-[10px] font-bold">{doc.type}</span>
              </div>
              <div>
                <h4 className="text-sm font-medium text-neutral-200 group-hover:text-indigo-400 transition-colors">
                  {doc.title}
                </h4>
                <div className="flex gap-2 mt-2">
                  {doc.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-neutral-700/50 text-neutral-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-6 border-t border-neutral-800 shrink-0">
        <button className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-neutral-600 rounded-xl text-sm font-bold text-neutral-300 transition-all border-dashed flex justify-center items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {tr.knowledge.upload}
        </button>
      </div>
    </div>
  );
}
