/**
 * Unified 5-level industrial gravity layout — single source of truth.
 *
 * Aligned with the backend topology schema (backend/app/core/graph/agents.py):
 *   L0 Power (y=60) → L1 Protection (y=160) → L2 Control (y=300)
 *   → L3 Execution (y=460) → L4 Feedback (y=600)
 *
 * Classification is type-exact first; Chinese/English label keywords are
 * only a fallback for AI-generated nodes with non-canonical types.
 *
 * All call sites (TopologyPanel auto-align, yjsStore gravity engine,
 * ChatPanel payload normalization) MUST delegate here instead of
 * re-implementing layer logic.
 */

export const GRAVITY_LAYER_Y: readonly number[] = [60, 160, 300, 460, 600];
export const GRAVITY_MIN_SPACING = 240;
export const GRAVITY_CENTER_X = 600;
export const GRAVITY_LAYER_COUNT = 5;

export interface GravityNodeInput {
  id: string;
  type?: string | null;
  label?: string | null;
  /** Current x used for stable in-layer ordering. */
  x?: number | null;
}

export interface GravityPosition {
  id: string;
  x: number;
  y: number;
}

const LAYER_BY_TYPE: Record<string, number> = {
  // L0 Power
  power: 0,
  transformer: 0,
  // L1 Protection
  circuit_breaker: 1,
  fuse: 1,
  disconnect: 1,
  estop: 1,
  safety_relay: 1,
  safety_door: 1,
  // L2 Control
  plc: 2,
  safety_plc: 2,
  ipc: 2,
  switch: 2,
  hmi: 2,
  // L3 Execution
  vfd: 3,
  servo: 3,
  contactor: 3,
  relay: 3,
  io: 3,
  signal_light: 3,
  indicator_light: 3,
  // L4 Feedback
  sensor: 4,
};

const LABEL_KEYWORDS: Array<[number, string[]]> = [
  [0, ['电源', '变压器', '进线', 'power', 'transformer']],
  [1, ['急停', '安全门', '安全继电器', '断路器', '熔断', '隔离开关', 'e-stop', 'estop', 'breaker', 'fuse']],
  [2, ['plc', '控制器', 's7-', '1200', '1500', '触摸屏', 'hmi', '交换机', '工控机']],
  [3, ['变频器', '伺服', '接触器', '继电器', '指示灯', '三色灯', '信号灯', 'vfd', 'contactor', 'relay']],
  [4, ['传感器', '光电', '接近开关', '编码器', 'sensor', 'encoder']],
];

/** Classify a node into gravity layer 0..4 (default: L3 Execution). */
export function gravityLayerOf(type: string | null | undefined, label: string | null | undefined): number {
  const t = String(type ?? '').trim().toLowerCase();
  if (t && Object.prototype.hasOwnProperty.call(LAYER_BY_TYPE, t)) {
    return LAYER_BY_TYPE[t];
  }
  const l = String(label ?? '').toLowerCase();
  if (l) {
    for (const [layer, keywords] of LABEL_KEYWORDS) {
      if (keywords.some((kw) => l.includes(kw))) return layer;
    }
  }
  return 3;
}

/**
 * Compute gravity-aligned positions for a set of nodes.
 *
 * - Nodes are bucketed by layer, sorted by current x within each layer
 *   (stable visual ordering), centered on GRAVITY_CENTER_X with
 *   GRAVITY_MIN_SPACING between neighbours.
 * - Returns one position per input node, in input order.
 */
export function computeGravityPositions<T extends GravityNodeInput>(nodes: readonly T[]): GravityPosition[] {
  if (nodes.length === 0) return [];

  const buckets: T[][] = Array.from({ length: GRAVITY_LAYER_COUNT }, () => []);
  for (const node of nodes) {
    buckets[gravityLayerOf(node.type, node.label)].push(node);
  }
  for (const bucket of buckets) {
    bucket.sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  }

  const posById = new Map<string, { x: number; y: number }>();
  buckets.forEach((bucket, layerIdx) => {
    const n = bucket.length;
    if (n === 0) return;
    const y = GRAVITY_LAYER_Y[layerIdx];
    const startX = GRAVITY_CENTER_X - ((n - 1) * GRAVITY_MIN_SPACING) / 2;
    bucket.forEach((node, idx) => {
      const x = n === 1 ? GRAVITY_CENTER_X : startX + idx * GRAVITY_MIN_SPACING;
      posById.set(node.id, { x, y });
    });
  });

  return nodes.map((node) => {
    const pos = posById.get(node.id) ?? { x: GRAVITY_CENTER_X, y: GRAVITY_LAYER_Y[3] };
    return { id: node.id, x: pos.x, y: pos.y };
  });
}
