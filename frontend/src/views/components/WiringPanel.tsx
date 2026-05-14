export interface WiringItem {
  tag: string;
  signal: string;
  from: string;
  to: string;
  wire: string;
}

interface Props {
  ioItems: WiringItem[];
}

export function WiringPanel({ ioItems }: Props) {
  if (ioItems.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-app-text-tertiary text-sm font-mono">
        未生成接线表 — 完成选型后将自动产出 I/O 端子表。
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto p-6 custom-scrollbar">
      <div className="text-[10px] font-mono tracking-widest text-app-text-tertiary uppercase mb-2">
        [ fig.04 ] terminal · wiring list
      </div>
      <h2 className="text-2xl font-bold mb-4 tracking-tight">接线表</h2>
      <table className="w-full text-xs font-mono border border-app-border">
        <thead>
          <tr className="bg-app-bg-tertiary text-app-text-secondary uppercase tracking-wider">
            <th className="text-left px-3 py-2 border-b border-app-border">Tag</th>
            <th className="text-left px-3 py-2 border-b border-app-border">Signal</th>
            <th className="text-left px-3 py-2 border-b border-app-border">From</th>
            <th className="text-left px-3 py-2 border-b border-app-border">To</th>
            <th className="text-left px-3 py-2 border-b border-app-border">Wire</th>
          </tr>
        </thead>
        <tbody>
          {ioItems.map((item, idx) => (
            <tr
              key={`${item.tag}-${idx}`}
              className={idx % 2 === 0 ? 'bg-app-bg-secondary' : 'bg-app-bg-primary'}
            >
              <td className="px-3 py-1.5 border-b border-app-border-light">{item.tag}</td>
              <td className="px-3 py-1.5 border-b border-app-border-light">{item.signal}</td>
              <td className="px-3 py-1.5 border-b border-app-border-light text-app-text-secondary">{item.from}</td>
              <td className="px-3 py-1.5 border-b border-app-border-light text-app-text-secondary">{item.to}</td>
              <td className="px-3 py-1.5 border-b border-app-border-light text-app-text-tertiary">{item.wire}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
