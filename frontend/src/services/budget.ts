// I/O budget computation for live constraint feedback.
//
// We don't have a strict BOM-row schema yet — components in the topology may
// declare `type === 'plc'` plus a `capacity: { di, do_, ai, ao }`, and
// signal-bearing rows may declare `signal: 'di' | 'do_' | 'ai' | 'ao'`. The
// underscore on `do` is to avoid colliding with the JS keyword.

export type Channel = 'di' | 'do_' | 'ai' | 'ao';

export interface BudgetItem {
  type?: string;
  signal?: string;
  model?: string;
  capacity?: Partial<Record<Channel, number>>;
}

export interface BudgetEntry {
  used: number;
  total: number;
  over: boolean;
}

export type BudgetResult = Record<Channel, BudgetEntry>;

const CHANNELS: Channel[] = ['di', 'do_', 'ai', 'ao'];

export function computeIOBudget(items: BudgetItem[]): BudgetResult | null {
  const totals: Record<Channel, number> = { di: 0, do_: 0, ai: 0, ao: 0 };
  const used: Record<Channel, number> = { di: 0, do_: 0, ai: 0, ao: 0 };
  let plcSeen = false;

  for (const it of items) {
    if (it.type === 'plc' && it.capacity) {
      plcSeen = true;
      for (const ch of CHANNELS) {
        totals[ch] += it.capacity[ch] ?? 0;
      }
    }
    if (it.signal && (CHANNELS as string[]).includes(it.signal)) {
      used[it.signal as Channel] += 1;
    }
  }

  if (!plcSeen) return null;

  const result = {} as BudgetResult;
  for (const ch of CHANNELS) {
    result[ch] = {
      used: used[ch],
      total: totals[ch],
      over: used[ch] > totals[ch],
    };
  }
  return result;
}
