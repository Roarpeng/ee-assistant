export interface ProcurementItem {
  manufacturer: string;
  model: string;
}

/**
 * Map a BOM item to a deep-linked procurement / catalog URL.
 *
 * - Siemens MPNs → Industry Mall product search
 * - Schneider MPNs → schneider-electric.com.cn product search
 * - Anything else → 工控168 (gongkong) generic search, the largest
 *   industrial-automation Chinese marketplace (no API account required)
 *
 * Returns '' when `model` is empty, so the caller can simply hide the link
 * cell instead of branching on it.
 */
export function buildProcurementUrl({ manufacturer, model }: ProcurementItem): string {
  const trimmed = (model ?? '').trim();
  if (!trimmed) return '';
  const m = (manufacturer ?? '').trim().toLowerCase();
  const q = encodeURIComponent(trimmed);
  if (m.includes('siemens')) {
    return `https://mall.industry.siemens.com/mall/en/cn/Catalog/Search/Products?searchTerm=${q}`;
  }
  if (m.includes('schneider')) {
    return `https://www.se.com/cn/zh/search/${q}`;
  }
  return `https://so.gongkong.com/key.aspx?q=${q}`;
}
