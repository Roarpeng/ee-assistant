import { describe, it, expect } from 'vitest';
import {
  GRAVITY_CENTER_X,
  GRAVITY_LAYER_Y,
  GRAVITY_MIN_SPACING,
  computeGravityPositions,
  gravityLayerOf,
} from './gravityLayout';

describe('gravityLayerOf', () => {
  it('classifies canonical types into the 5 industrial levels', () => {
    expect(gravityLayerOf('power', '')).toBe(0);
    expect(gravityLayerOf('transformer', '')).toBe(0);
    expect(gravityLayerOf('circuit_breaker', '')).toBe(1);
    expect(gravityLayerOf('estop', '')).toBe(1);
    expect(gravityLayerOf('safety_door', '')).toBe(1);
    expect(gravityLayerOf('plc', '')).toBe(2);
    expect(gravityLayerOf('safety_plc', '')).toBe(2);
    expect(gravityLayerOf('switch', '')).toBe(2);
    expect(gravityLayerOf('hmi', '')).toBe(2);
    expect(gravityLayerOf('vfd', '')).toBe(3);
    expect(gravityLayerOf('io', '')).toBe(3);
    expect(gravityLayerOf('signal_light', '')).toBe(3);
    expect(gravityLayerOf('sensor', '')).toBe(4);
  });

  it('falls back to Chinese label keywords for unknown types', () => {
    expect(gravityLayerOf('unknown', '主电源进线')).toBe(0);
    expect(gravityLayerOf('unknown', '急停按钮')).toBe(1);
    expect(gravityLayerOf('unknown', 'S7-1200 CPU')).toBe(2);
    expect(gravityLayerOf('unknown', '变频器 MM440')).toBe(3);
    expect(gravityLayerOf('unknown', '光电传感器')).toBe(4);
  });

  it('defaults unknown type+label to L3 Execution', () => {
    expect(gravityLayerOf('weird', 'xyz')).toBe(3);
    expect(gravityLayerOf('', '')).toBe(3);
  });
});

describe('computeGravityPositions', () => {
  it('returns empty for empty input', () => {
    expect(computeGravityPositions([])).toEqual([]);
  });

  it('assigns the canonical layer y per type', () => {
    const positions = computeGravityPositions([
      { id: 'p', type: 'power', x: 0 },
      { id: 'c', type: 'plc', x: 0 },
      { id: 's', type: 'sensor', x: 0 },
    ]);
    const byId = new Map(positions.map((p) => [p.id, p]));
    expect(byId.get('p')?.y).toBe(GRAVITY_LAYER_Y[0]);
    expect(byId.get('c')?.y).toBe(GRAVITY_LAYER_Y[2]);
    expect(byId.get('s')?.y).toBe(GRAVITY_LAYER_Y[4]);
  });

  it('centers a single node on the canvas center x', () => {
    const [pos] = computeGravityPositions([{ id: 'a', type: 'plc', x: 123 }]);
    expect(pos.x).toBe(GRAVITY_CENTER_X);
  });

  it('sorts in-layer nodes by current x and spaces them evenly around center', () => {
    const positions = computeGravityPositions([
      { id: 'right', type: 'contactor', x: 500 },
      { id: 'left', type: 'relay', x: 100 },
      { id: 'mid', type: 'vfd', x: 300 },
    ]);
    const byId = new Map(positions.map((p) => [p.id, p]));
    // sorted by x: left(100) < mid(300) < right(500)
    expect(byId.get('left')!.x).toBeLessThan(byId.get('mid')!.x);
    expect(byId.get('mid')!.x).toBeLessThan(byId.get('right')!.x);
    expect(byId.get('mid')!.x).toBe(GRAVITY_CENTER_X);
    expect(byId.get('right')!.x! - byId.get('mid')!.x!).toBe(GRAVITY_MIN_SPACING);
    expect(byId.get('left')!.y).toBe(GRAVITY_LAYER_Y[3]);
  });

  it('returns one position per input node, in input order', () => {
    const input = [
      { id: 'b', type: 'sensor', x: 0 },
      { id: 'a', type: 'power', x: 0 },
    ];
    const positions = computeGravityPositions(input);
    expect(positions.map((p) => p.id)).toEqual(['b', 'a']);
  });
});
