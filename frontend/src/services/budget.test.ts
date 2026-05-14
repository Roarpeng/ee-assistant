import { describe, it, expect } from 'vitest';
import { computeIOBudget } from './budget';

describe('computeIOBudget', () => {
  it('returns null when no PLC capacity is in the BOM', () => {
    const out = computeIOBudget([{ type: 'sensor', signal: 'di' }]);
    expect(out).toBeNull();
  });

  it('sums DI / DO / AI / AO consumers against PLC capacity', () => {
    const out = computeIOBudget([
      { type: 'plc', model: 'S7-1215C', capacity: { di: 14, do_: 10, ai: 2, ao: 2 } },
      { type: 'sensor', signal: 'di' },
      { type: 'sensor', signal: 'di' },
      { type: 'actuator', signal: 'do_' },
      { type: 'sensor', signal: 'ai' },
    ]);
    expect(out).not.toBeNull();
    expect(out!.di).toEqual({ used: 2, total: 14, over: false });
    expect(out!.do_).toEqual({ used: 1, total: 10, over: false });
    expect(out!.ai).toEqual({ used: 1, total: 2, over: false });
    expect(out!.ao).toEqual({ used: 0, total: 2, over: false });
  });

  it('flags over-budget channels with the over flag', () => {
    const out = computeIOBudget([
      { type: 'plc', model: 'mini', capacity: { di: 1, do_: 0, ai: 0, ao: 0 } },
      { type: 'sensor', signal: 'di' },
      { type: 'sensor', signal: 'di' },
    ]);
    expect(out!.di.used).toBe(2);
    expect(out!.di.total).toBe(1);
    expect(out!.di.over).toBe(true);
    expect(out!.do_.over).toBe(false);
  });

  it('aggregates capacity across multiple PLC racks', () => {
    const out = computeIOBudget([
      { type: 'plc', model: 'A', capacity: { di: 8, do_: 8, ai: 0, ao: 0 } },
      { type: 'plc', model: 'B', capacity: { di: 8, do_: 0, ai: 4, ao: 0 } },
      { type: 'sensor', signal: 'di' },
    ]);
    expect(out!.di.total).toBe(16);
    expect(out!.ai.total).toBe(4);
    expect(out!.di.used).toBe(1);
  });

  it('ignores items with no recognised signal', () => {
    const out = computeIOBudget([
      { type: 'plc', model: 'A', capacity: { di: 4, do_: 4, ai: 0, ao: 0 } },
      { type: 'enclosure', signal: 'none' },
      { type: 'cable' },
    ]);
    expect(out!.di.used).toBe(0);
    expect(out!.do_.used).toBe(0);
  });
});
