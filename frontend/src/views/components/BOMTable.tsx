import type { BOMItem } from '../../models/selection';

const confidenceBadge = (level: string) => {
  if (level === 'rag') return <span className="inline-flex items-center px-2 py-0.5 rounded-app-sm text-xs font-medium bg-[var(--color-success-light)] text-[var(--color-success)]">Verified</span>;
  if (level === 'llm') return <span className="inline-flex items-center px-2 py-0.5 rounded-app-sm text-xs font-medium bg-[var(--color-warning-light)] text-[var(--color-warning)]">Inferred</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-app-sm text-xs font-medium bg-[var(--color-accent-light)] text-[var(--color-accent)]">Mixed</span>;
};

export function BOMTable({ items }: { items: BOMItem[] }) {
  if (!items.length) {
    return <div className="flex items-center justify-center h-full text-[var(--color-text-tertiary)]">No BOM items. Run selection first.</div>;
  }

  return (
    <div className="w-full h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-bg-tertiary)] sticky top-0">
          <tr>
            <th className="text-left p-2">Category</th>
            <th className="text-left p-2">Manufacturer</th>
            <th className="text-left p-2">Model</th>
            <th className="text-center p-2">Qty</th>
            <th className="text-center p-2">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-[var(--color-border-light)] hover:bg-[var(--color-bg-tertiary)] transition-colors">
              <td className="p-2">{item.category}</td>
              <td className="p-2">{item.manufacturer}</td>
              <td className="p-2 font-mono text-xs">{item.model}</td>
              <td className="p-2 text-center">{item.quantity}</td>
              <td className="p-2 text-center">{confidenceBadge(item.confidence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
