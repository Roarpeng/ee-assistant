import { useMemo } from 'react';
import { Paper, Box, Typography, alpha, useTheme } from '@mui/material';
import { footprintFor, packCabinet, type Placed } from '../../services/cabinet';

interface CabinetSpec {
  width: number;
  height: number;
}

interface Props {
  cabinet?: CabinetSpec;
  components: Array<{ id: string; type: string; label: string }>;
}

// Accent strokes per component type.
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
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.disabled',
          typography: 'bodyMedium',
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        未生成布局 — 完成选型后将自动估算控制柜俯视图。
      </Box>
    );
  }

  // Compute actual content extent so we can scale-to-fit.
  const maxX = Math.max(...placed.map((p) => p.x + p.w), cabinet.width);
  const maxY = Math.max(...placed.map((p) => p.y + p.h), cabinet.height);
  const labels = new Map(components.map((c) => [c.id, c.label]));
  const theme = useTheme();

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 3 }} className="custom-scrollbar">
      <Typography
        variant="labelSmall"
        sx={{
          fontFamily: '"JetBrains Mono", monospace',
          letterSpacing: '0.1em',
          color: 'text.disabled',
          textTransform: 'uppercase',
          mb: 1,
          display: 'block',
        }}
      >
        [ fig.07 ] cabinet &middot; top-down layout (mm)
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="headlineSmall" sx={{ fontWeight: 700 }}>
          控制柜布局
        </Typography>
        <Typography
          variant="labelSmall"
          sx={{ fontFamily: '"JetBrains Mono", monospace', color: 'text.disabled' }}
        >
          {cabinet.width} &times; {cabinet.height} mm
        </Typography>
      </Box>
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 2,
          overflow: 'hidden',
          display: 'inline-block',
          maxWidth: '100%',
        }}
      >
        <Box
          component="svg"
          viewBox={`-20 -20 ${maxX + 40} ${maxY + 40}`}
          sx={{ display: 'block', maxWidth: 768, bgcolor: 'background.paper' }}
        >
          <rect
            x={0}
            y={0}
            width={cabinet.width}
            height={cabinet.height}
            fill="none"
            stroke={theme.palette.divider}
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
                  fill={c + '1a'}
                  stroke={c}
                  strokeWidth={1.5}
                />
                <text
                  x={p.x + p.w / 2}
                  y={p.y + p.h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={Math.max(9, Math.min(p.w, p.h) / 6)}
                  fill={theme.palette.text.primary}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {labels.get(p.id) ?? p.id}
                </text>
                <text
                  x={p.x + p.w / 2}
                  y={p.y + p.h - 4}
                  textAnchor="middle"
                  fontSize={Math.max(7, Math.min(p.w, p.h) / 9)}
                  fill={theme.palette.text.disabled}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {p.w}&times;{p.h}
                </text>
              </g>
            );
          })}
        </Box>
      </Paper>
    </Box>
  );
}
