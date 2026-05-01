import type { BOMItem } from '../../models/selection';

const confidenceBadge = (level: string) => {
  if (level === 'rag') return <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">Verified</span>;
  if (level === 'llm') return <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">Inferred</span>;
  return <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Mixed</span>;
};

export function BOMTable({ items }: { items: BOMItem[] }) {
  if (!items.length) {
    return <div className="flex items-center justify-center h-full text-gray-400">No BOM items. Run selection first.</div>;
  }

  return (
    <div className="w-full h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 sticky top-0">
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
            <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
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
