import { describe, it, expect } from 'vitest';
import { packCabinet, footprintFor } from './cabinet';

describe('packCabinet', () => {
  it('places every item inside the cabinet bounds', () => {
    const out = packCabinet({
      width: 600,
      height: 800,
      items: [
        { id: 'a', type: 'plc', w: 100, h: 100 },
        { id: 'b', type: 'breaker', w: 50, h: 80 },
      ],
    });
    expect(out).toHaveLength(2);
    for (const p of out) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(600);
      expect(p.y + p.h).toBeLessThanOrEqual(800);
    }
  });

  it('returns empty for no items', () => {
    expect(packCabinet({ width: 600, height: 800, items: [] })).toEqual([]);
  });

  it('wraps to next row when width is exceeded', () => {
    const out = packCabinet({
      width: 200,
      height: 400,
      items: [
        { id: 'a', type: 'x', w: 80, h: 50 },
        { id: 'b', type: 'x', w: 80, h: 50 },
        { id: 'c', type: 'x', w: 80, h: 50 },
      ],
    });
    expect(out[0].y).toBe(0);
    expect(out[1].y).toBe(0);
    expect(out[2].y).toBeGreaterThan(0);
  });

  it('preserves input id and type on output', () => {
    const out = packCabinet({
      width: 600,
      height: 600,
      items: [{ id: 'x42', type: 'vfd', w: 100, h: 100 }],
    });
    expect(out[0].id).toBe('x42');
    expect(out[0].type).toBe('vfd');
  });
});

describe('footprintFor', () => {
  it('returns specific footprints for known types', () => {
    expect(footprintFor('plc')).toEqual({ w: 120, h: 100 });
    expect(footprintFor('vfd')).toEqual({ w: 200, h: 250 });
    expect(footprintFor('breaker')).toEqual({ w: 50, h: 90 });
  });

  it('falls back to placeholder for unknown types', () => {
    expect(footprintFor('this-is-not-a-type')).toEqual({ w: 50, h: 50 });
  });
});
