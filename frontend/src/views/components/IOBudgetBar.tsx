import type { BudgetResult } from '../../services/budget';

interface Props {
  budget: BudgetResult | null;
}

const LABELS = {
  di: 'DI',
  do_: 'DO',
  ai: 'AI',
  ao: 'AO',
} as const;

export function IOBudgetBar({ budget }: Props) {
  if (!budget) return null;
  const channels = ['di', 'do_', 'ai', 'ao'] as const;
  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex gap-3 bg-app-bg-secondary/90 backdrop-blur border border-app-border rounded-md px-3 py-2 shadow-sm pointer-events-none"
      role="status"
      aria-label="I/O budget"
    >
      {channels.map((ch) => {
        const b = budget[ch];
        const pct = b.total === 0
          ? (b.used > 0 ? 100 : 0)
          : Math.min(100, (b.used / b.total) * 100);
        const fill = b.over
          ? 'var(--color-error)'
          : pct > 80
            ? 'var(--color-warning)'
            : 'var(--color-success)';
        return (
          <div key={ch} className="flex items-center gap-2 min-w-[78px]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-app-text-tertiary w-6">
              {LABELS[ch]}
            </span>
            <div className="flex-1 h-1.5 bg-app-bg-tertiary rounded-full overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ width: `${pct}%`, background: fill }}
              />
            </div>
            <span
              className="text-[10px] font-mono tabular-nums"
              style={{ color: b.over ? 'var(--color-error)' : 'var(--color-text-secondary)' }}
            >
              {b.used}/{b.total}
            </span>
          </div>
        );
      })}
    </div>
  );
}
