import { Download } from 'lucide-react';
import { useStore } from '../../models/store';
import { t } from '../../services/i18n';
import Editor from '@monaco-editor/react';

export function SCLPanel() {
  const code = useStore((s) => s.sclCode);
  const language = useStore((s) => s.language);
  const tr = t(language);

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col p-8 rounded-[2.5rem]">
      <div className="absolute -right-20 -top-20 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px]" />

      <div className="flex justify-between items-center mb-8 relative z-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full mb-3">
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
              {tr.scl.target}
            </span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white">{tr.scl.title}</h2>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-white text-black text-sm font-bold rounded-2xl shadow-sm hover:scale-105 active:scale-95 transition-all mt-4">
          <Download className="w-4 h-4" />
          {tr.scl.download}
        </button>
      </div>

      <div className="flex-1 bg-neutral-950 border border-neutral-800 rounded-[2rem] overflow-hidden shadow-inner relative z-10">
        <Editor
          height="100%"
          defaultLanguage="pascal"
          value={code}
          theme="vs-dark"
          options={{
            readOnly: false,
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
          }}
          loading={
            <div className="flex items-center justify-center h-full text-neutral-500">
              {tr.scl.loading}
            </div>
          }
        />
      </div>
    </div>
  );
}
