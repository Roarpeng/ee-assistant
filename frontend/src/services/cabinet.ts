// Cabinet top-view layout — simple shelf packer.
//
// We model a control cabinet as a rectangle (mm) and lay components out
// left→right, wrapping to a new row when we'd exceed the width. Heights
// inside a row are tracked so the next row starts below the tallest item
// of the current row. No rotation, no gap optimisation — this is a quick
// visual aid, not a real cabinet planner.

export interface CabinetItemIn {
  id: string;
  type: string;
  w: number;
  h: number;
}

export interface PackInput {
  width: number;
  height: number;
  items: CabinetItemIn[];
}

export interface Placed {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function packCabinet({ width, items }: PackInput): Placed[] {
  const out: Placed[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const it of items) {
    if (x + it.w > width) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    out.push({ id: it.id, type: it.type, x, y, w: it.w, h: it.h });
    x += it.w;
    rowH = Math.max(rowH, it.h);
  }
  return out;
}

// Approximate physical footprints in mm for the common cabinet components.
// Numbers are rounded so the visual layout reads at a glance — not for
// engineering use.
const FOOTPRINTS: Record<string, { w: number; h: number }> = {
  plc: { w: 120, h: 100 },
  hmi: { w: 200, h: 150 },
  io: { w: 110, h: 100 },
  vfd: { w: 200, h: 250 },
  contactor: { w: 45, h: 80 },
  relay: { w: 30, h: 60 },
  breaker: { w: 50, h: 90 },
  terminal: { w: 30, h: 70 },
  power: { w: 80, h: 130 },
  servo: { w: 80, h: 200 },
  motor: { w: 100, h: 100 },
};

export function footprintFor(type: string): { w: number; h: number } {
  return FOOTPRINTS[type] ?? { w: 50, h: 50 };
}
