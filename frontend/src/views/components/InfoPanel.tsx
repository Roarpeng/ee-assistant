interface Props {
  projectName: string;
  safetyLevel?: string;
  bomCost?: number;
  components: Array<{ id: string; label: string; type: string }>;
  nodes: Array<{ id: string }>;
}

function fmtNum(n?: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-app-border rounded-md p-3 bg-app-bg-secondary">
      <div className="text-[10px] uppercase tracking-widest text-app-text-tertiary font-mono">
        {label}
      </div>
      <div className="text-xl font-bold mt-1 tracking-tight">{value}</div>
    </div>
  );
}

export function InfoPanel({
  projectName,
  safetyLevel,
  bomCost,
  components,
  nodes,
}: Props) {
  const empty =
    !projectName && components.length === 0 && nodes.length === 0;

  if (empty) {
    return (
      <div className="h-full flex items-center justify-center text-app-text-tertiary text-sm font-mono">
        尚未生成项目概览 — 在左侧对话中描述需求即可。
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-8 max-w-3xl mx-auto custom-scrollbar">
      <div className="text-[10px] font-mono tracking-widest text-app-text-tertiary uppercase mb-2">
        [ fig.00 ] project overview · rev a
      </div>
      <h2 className="text-3xl font-bold mb-6 tracking-tight">
        {projectName || '未命名项目'}
      </h2>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Stat label="安全等级" value={safetyLevel ?? '—'} />
        <Stat label="估价 (CNY)" value={fmtNum(bomCost)} />
        <Stat label="元器件数" value={String(components.length)} />
      </div>
      <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-app-text-secondary mb-3">
        元器件清单 ({components.length})
      </h3>
      {components.length === 0 ? (
        <div className="text-xs font-mono text-app-text-tertiary">
          尚未选型,请向 Volta 描述工艺需求。
        </div>
      ) : (
        <ul className="space-y-0 text-sm font-mono">
          {components.map((c) => (
            <li
              key={c.id}
              className="flex justify-between border-b border-app-border-light py-1.5"
            >
              <span>{c.label}</span>
              <span className="text-app-text-tertiary uppercase tracking-wide text-xs">
                {c.type}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
