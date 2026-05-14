import { useState } from 'react';

interface Props {
  onSubmit: (prompt: string) => void;
  examples: string[];
}

export function HeroLanding({ onSubmit, examples }: Props) {
  const [value, setValue] = useState('');

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-app-bg-primary text-app-text-primary px-6">
      <div className="w-full max-w-2xl">
        <div className="text-[10px] font-mono tracking-widest text-app-text-tertiary mb-4 uppercase">
          [ fig.01 ] volta · ee assistant
        </div>
        <h1 className="text-4xl font-bold mb-2 tracking-tight">
          你想设计什么电气方案?
        </h1>
        <p className="text-app-text-secondary mb-6">
          用一句话描述你的工艺/控制目标 — Volta 会拆解需求、出选型 BOM、原理图与 PLC ST 代码。
        </p>
        <div className="border border-app-border rounded-lg bg-app-bg-secondary p-3 shadow-app-md">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit(value);
              }
            }}
            rows={3}
            placeholder="例如：恒温水箱 PLC 控制系统, 需 PLd 安全等级, AC 380V 三相"
            className="w-full bg-transparent outline-none resize-none text-sm font-mono"
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-[10px] font-mono uppercase tracking-wide text-app-text-tertiary">
              ⌘ + ↵ 提交
            </span>
            <button
              type="button"
              onClick={() => submit(value)}
              className="px-4 py-1.5 rounded-md bg-app-accent text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-app-accent-hover transition-colors"
              disabled={!value.trim()}
            >
              开始设计 →
            </button>
          </div>
        </div>
        {examples.length > 0 && (
          <div className="mt-6">
            <div className="text-[10px] font-mono uppercase tracking-widest text-app-text-tertiary mb-2">
              需要灵感?
            </div>
            <div className="flex flex-wrap gap-2">
              {examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => submit(ex)}
                  className="px-3 py-1.5 text-xs rounded-full border border-app-border text-app-text-secondary hover:text-app-text-primary hover:border-app-accent hover:bg-app-bg-secondary transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
