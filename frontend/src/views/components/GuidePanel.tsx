export interface GuideStep {
  title: string;
  body: string;
}

interface Props {
  steps: GuideStep[];
}

export function GuidePanel({ steps }: Props) {
  if (steps.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-app-text-tertiary text-sm font-mono">
        未生成调试指引 — 完成代码生成后将自动产出步骤化指引。
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto p-6 max-w-3xl mx-auto custom-scrollbar">
      <div className="text-[10px] font-mono tracking-widest text-app-text-tertiary uppercase mb-2">
        [ fig.06 ] commissioning · runbook
      </div>
      <h2 className="text-2xl font-bold mb-6 tracking-tight">装配 / 调试指引</h2>
      <ol className="space-y-4">
        {steps.map((step, idx) => (
          <li
            key={idx}
            className="border border-app-border rounded-md bg-app-bg-secondary p-4 flex gap-4"
          >
            <div className="text-2xl font-mono font-bold text-app-accent tabular-nums w-10 shrink-0">
              {String(idx + 1).padStart(2, '0')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold mb-1">{step.title}</div>
              <div className="text-sm text-app-text-secondary whitespace-pre-wrap">
                {step.body}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
