import { useMemo } from 'react';
import { footprintFor, packCabinet, type Placed } from '../../services/cabinet';

interface CabinetSpec {
  width: number;
  height: number;
}

interface Props {
  cabinet?: CabinetSpec;
  components: Array<{ id: string; type: string; label: string }>;
}

// Tailwind-known accent strokes per component type. Centralised so the
// legend and the rectangles stay in sync.
const TYPE_COLOR: Record<string, string> = {
  plc: '#4ec9ff',
  hmi: '#c084fc',
  io: '#fbbf24',
  vfd: '#4ade80',
  contactor: '#fb923c',
  relay: '#f87171',
  breaker: '#f43f5e',
  terminal: '#94a3b8',
  power: '#facc15',
  servo: '#06b6d4',
  motor: '#a78bfa',
};

function colourFor(type: string): string {
  return TYPE_COLOR[type] ?? '#8b95a3';
}

export function CabinetPanel({
  cabinet = { width: 600, height: 800 },
  components,
}: Props) {
  const placed = useMemo<Placed[]>(() => {
    const items = components.map((c) => ({
      id: c.id,
      type: c.type,
      ...footprintFor(c.type),
    }));
    return packCabinet({
      width: cabinet.width,
      height: cabinet.height,
      items,
    });
  }, [components, cabinet.width, cabinet.height]);

  if (components.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-app-text-tertiary text-sm font-mono">
        未生成布局 — 完成选型后将自动估算控制柜俯视图。
      </div>
    );
  }

  // Compute actual content extent so we can scale-to-fit.
  const maxX = Math.max(...placed.map((p) => p.x + p.w), cabinet.width);
  const maxY = Math.max(...placed.map((p) => p.y + p.h), cabinet.height);
  const labels = new Map(components.map((c) => [c.id, c.label]));

  return (
    <div className="h-full overflow-auto p-6 custom-scrollbar">
      <div className="text-[10px] font-mono tracking-widest text-app-text-tertiary uppercase mb-2">
        [ fig.07 ] cabinet · top-down layout (mm)
      </div>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-2xl font-bold tracking-tight">控制柜布局</h2>
        <span className="text-[10px] font-mono text-app-text-tertiary">
          {cabinet.width} × {cabinet.height} mm
        </span>
      </div>
      <svg
        viewBox={`-20 -20 ${maxX + 40} ${maxY + 40}`}
        className="w-full max-w-3xl border border-app-border bg-app-bg-secondary rounded-md"
      >
        <rect
          x={0}
          y={0}
          width={cabinet.width}
          height={cabinet.height}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={2}
          strokeDasharray="4 4"
        />
        {placed.map((p) => {
          const c = colourFor(p.type);
          return (
            <g key={p.id}>
              <rect
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.h}
                fill={`${c}1a`}
                stroke={c}
                strokeWidth={1.5}
              />
              <text
                x={p.x + p.w / 2}
                y={p.y + p.h / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(9, Math.min(p.w, p.h) / 6)}
                fill="var(--color-text-primary)"
                fontFamily="JetBrains Mono, monospace"
              >
                {labels.get(p.id) ?? p.id}
              </text>
              <text
                x={p.x + p.w / 2}
                y={p.y + p.h - 4}
                textAnchor="middle"
                fontSize={Math.max(7, Math.min(p.w, p.h) / 9)}
                fill="var(--color-text-tertiary)"
                fontFamily="JetBrains Mono, monospace"
              >
                {p.w}×{p.h}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
