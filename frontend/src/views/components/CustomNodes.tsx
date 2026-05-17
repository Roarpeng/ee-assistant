import type { CSSProperties } from 'react';
import { Box, Typography } from '@mui/material';
import { Handle, Position } from 'reactflow';

// Color tokens per electrical-circuit category — kept in sync with
// `CATEGORY_COLORS` used in TopologyPanel for edge stroke.
const HANDLE_COLOR = {
  power: '#f59e0b',    // amber  — power lines (top/bottom)
  network: '#3b82f6',  // blue   — field network (left/right)
  safety: '#ef4444',   // red    — safety bus (left/right)
  feedback: '#10b981', // green  — sensor feedback (top/bottom, opposite of power)
} as const;

type HandleCategory = keyof typeof HANDLE_COLOR;

function handleStyle(category: HandleCategory, selected?: boolean): CSSProperties {
  const color = HANDLE_COLOR[category];
  return {
    background: color,
    borderColor: selected ? '#ffffff' : '#0a0a0a',
    boxShadow: selected ? `0 0 8px ${color}` : 'none',
    width: 9,
    height: 9,
    borderRadius: 9,
    borderWidth: 1.5,
    borderStyle: 'solid',
    transition: 'opacity 200ms, transform 200ms, box-shadow 200ms',
    opacity: selected ? 1 : 0,
    zIndex: 50,
  };
}

// 8 named handles per node. Layout:
//   top edge:    pwr-top (target, orange) | fb-top (source, green)
//   bottom edge: pwr-bottom (source, orange) | fb-bottom (target, green)
//   left edge:   safe-left (target, red) | net-left (target, blue)
//   right edge:  safe-right (source, red) | net-right (source, blue)
//
// Handles become visible on hover via the parent Box's sx.
export function NodeHandles({ selected }: { selected?: boolean }) {
  return (
    <>
      {/* Top edge — power in (target) + feedback out (source) */}
      <Handle
        type="target"
        position={Position.Top}
        id="pwr-top"
        style={{ ...handleStyle('power', selected), left: '30%' }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="fb-top"
        style={{ ...handleStyle('feedback', selected), left: '70%' }}
      />

      {/* Right edge — network out (source) + safety out (source) */}
      <Handle
        type="source"
        position={Position.Right}
        id="net-right"
        style={{ ...handleStyle('network', selected), top: '35%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="safe-right"
        style={{ ...handleStyle('safety', selected), top: '70%' }}
      />

      {/* Bottom edge — power out (source) + feedback in (target) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="pwr-bottom"
        style={{ ...handleStyle('power', selected), left: '30%' }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="fb-bottom"
        style={{ ...handleStyle('feedback', selected), left: '70%' }}
      />

      {/* Left edge — network in (target) + safety in (target) */}
      <Handle
        type="target"
        position={Position.Left}
        id="net-left"
        style={{ ...handleStyle('network', selected), top: '35%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="safe-left"
        style={{ ...handleStyle('safety', selected), top: '70%' }}
      />
    </>
  );
}

// Base hover style for all node containers (shows handles on hover)
function nodeContainerSx(width: number) {
  return {
    width,
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    '&:hover .react-flow__handle': {
      opacity: '1 !important',
      transform: 'scale(1.5) !important',
    },
  };
}

function nodeLabelSx(selected?: boolean) {
  return {
    mt: 1,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    fontSize: 11,
    letterSpacing: '0.05em',
    color: selected ? 'primary.light' : 'text.secondary',
    transition: 'color 200ms',
  };
}

// ────────────────────────────────────────────────────────────────────
// PLC
// ────────────────────────────────────────────────────────────────────
export function PLCNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(180)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 120,
          width: 150,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(99,102,241,0.5)',
          borderRadius: 4,
          display: 'flex',
          overflow: 'hidden',
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Left panel - LEDs */}
        <Box sx={{ width: '33%', height: '100%', borderRight: 1, borderColor: '#404040', bgcolor: '#171717', p: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981', boxShadow: '0 0 8px #10b981' }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#f43f5e' }} />
          </Box>
        </Box>
        {/* IO strips */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', bgcolor: '#404040', px: 0.5, py: 0.5 }}>
          {[...Array(8)].map((_, i) => (
            <Box key={i} sx={{ flex: 1, bgcolor: '#262626', borderRadius: '2px' }} />
          ))}
        </Box>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', bgcolor: '#404040', px: 0.5, py: 0.5, borderLeft: 1, borderColor: '#525252' }}>
          {[...Array(8)].map((_, i) => (
            <Box key={i} sx={{ flex: 1, bgcolor: '#262626', borderRadius: '2px' }} />
          ))}
        </Box>
      </Box>
      <Typography sx={nodeLabelSx(selected)}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// HMI
// ────────────────────────────────────────────────────────────────────
export function HMINode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(180)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 120,
          width: 160,
          bgcolor: '#0a0a0a',
          border: 4,
          borderColor: selected ? 'primary.main' : '#404040',
          borderRadius: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 1,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box
          sx={{
            width: '100%',
            height: '100%',
            bgcolor: 'rgba(38,38,38,0.8)',
            border: 1,
            borderColor: selected ? 'rgba(99,102,241,0.5)' : '#404040',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            component="svg"
            width={32}
            height={32}
            viewBox="0 0 24 24"
            fill="none"
            stroke={selected ? '#a5b4fc' : '#818cf8'}
            strokeWidth="2"
          >
            <path d="M11 11V7a2 2 0 012-2v0a2 2 0 012 2v2M15 11v-1a2 2 0 012-2v0a2 2 0 012 2v4a6 6 0 01-6 6h-2a6 6 0 01-6-6v-5a2 2 0 012-2h0a2 2 0 012 2v3" />
          </Box>
        </Box>
      </Box>
      <Typography sx={nodeLabelSx(selected)}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// IO Module
// ────────────────────────────────────────────────────────────────────
export function IONode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(180)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 120,
          width: 140,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : '#404040',
          borderRadius: 4,
          display: 'flex',
          overflow: 'hidden',
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Side indicator strip */}
        <Box
          sx={{
            width: 32,
            height: '100%',
            bgcolor: 'rgba(245,158,11,0.9)',
            borderRight: 1,
            borderColor: selected ? 'primary.main' : '#404040',
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            alignItems: 'center',
            py: 1.5,
          }}
        >
          <Box
            sx={{
              width: 16,
              height: 16,
              bgcolor: '#171717',
              borderRadius: '50%',
              border: 2,
              borderColor: selected ? 'primary.main' : 'rgba(252,211,77,0.5)',
            }}
          />
        </Box>
        {/* IO channel grid */}
        <Box
          sx={{
            flex: 1,
            height: '100%',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '2px',
            p: 0.5,
            bgcolor: '#404040',
          }}
        >
          {[...Array(32)].map((_, i) => (
            <Box
              key={i}
              sx={{
                width: '100%',
                height: '100%',
                borderRadius: '2px',
                bgcolor:
                  i % 5 === 0
                    ? 'rgba(16,185,129,0.8)'
                    : i % 7 === 0
                      ? 'rgba(244,63,94,0.8)'
                      : '#262626',
                boxShadow:
                  i % 5 === 0
                    ? '0 0 4px #10b981'
                    : i % 7 === 0
                      ? '0 0 4px #f43f5e'
                      : 'none',
              }}
            />
          ))}
        </Box>
      </Box>
      <Typography sx={nodeLabelSx(selected)}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// VFD (Variable Frequency Drive)
// ────────────────────────────────────────────────────────────────────
export function VFDNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(120)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 130,
          width: 80,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : '#404040',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          p: 1,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box sx={{ width: '100%', height: 24, bgcolor: '#0a0a0a', borderTopLeftRadius: 8, borderTopRightRadius: 8, mb: 1 }} />
        <Box
          sx={{
            width: '100%',
            height: 32,
            bgcolor: 'rgba(5,46,22,0.5)',
            border: 1,
            borderColor: 'rgba(16,185,129,0.3)',
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: '#34d399',
            fontFamily: '"JetBrains Mono", monospace',
            borderRadius: '2px',
          }}
        >
          50.0Hz
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, width: '100%', px: 1 }}>
          <Box sx={{ height: 12, bgcolor: 'rgba(244,63,94,0.8)', borderRadius: 999 }} />
          <Box sx={{ height: 12, bgcolor: 'rgba(16,185,129,0.8)', borderRadius: 999 }} />
        </Box>
      </Box>
      <Typography sx={nodeLabelSx(selected)}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// Servo Drive
// ────────────────────────────────────────────────────────────────────
export function ServoNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(160)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 110,
          width: 140,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(6,182,212,0.5)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          p: 1.5,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box
          sx={{
            width: '100%',
            height: 28,
            bgcolor: '#0a0a0a',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: '#22d3ee',
            fontFamily: '"JetBrains Mono", monospace',
            letterSpacing: '0.05em',
          }}
        >
          SERVO
        </Box>
        <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
          <Box
            sx={{
              flex: 1,
              height: 40,
              bgcolor: '#171717',
              borderRadius: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
            }}
          >
            <Box sx={{ width: 32, height: 4, bgcolor: 'rgba(6,182,212,0.6)', borderRadius: 999 }} />
            <Box sx={{ width: 32, height: 4, bgcolor: 'rgba(6,182,212,0.4)', borderRadius: 999 }} />
            <Box sx={{ width: 32, height: 4, bgcolor: 'rgba(6,182,212,0.2)', borderRadius: 999 }} />
          </Box>
          <Box
            sx={{
              width: 32,
              height: 40,
              bgcolor: '#171717',
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box
              sx={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: 2,
                borderColor: 'rgba(6,182,212,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: '#06b6d4',
                  animation: 'servo-pulse 2s infinite',
                  '@keyframes servo-pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.4 },
                  },
                }}
              />
            </Box>
          </Box>
        </Box>
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#22d3ee' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// Power Supply
// ────────────────────────────────────────────────────────────────────
export function PowerNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(140)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 90,
          width: 120,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(245,158,11,0.5)',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 0.75,
          p: 1,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}>
          <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', fontFamily: '"JetBrains Mono", monospace' }}>
            24V
          </Typography>
          <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', fontFamily: '"JetBrains Mono", monospace' }}>
            10A
          </Typography>
        </Box>
        <Box sx={{ flex: 1, bgcolor: '#171717', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ width: 48, height: 8, bgcolor: 'rgba(245,158,11,0.4)', borderRadius: 999, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', fontSize: 8, color: 'rgba(251,191,36,0.6)', fontFamily: '"JetBrains Mono", monospace' }}>
              ~
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
          <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: 'rgba(245,158,11,0.2)', border: 1, borderColor: 'rgba(245,158,11,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#f59e0b' }} />
          </Box>
          <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: 'rgba(16,185,129,0.2)', border: 1, borderColor: 'rgba(16,185,129,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#10b981' }} />
          </Box>
        </Box>
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#fbbf24' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// Industrial Switch
// ────────────────────────────────────────────────────────────────────
export function SwitchNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(160)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 100,
          width: 145,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(59,130,246,0.5)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          p: 1,
          gap: 0.5,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', fontFamily: '"JetBrains Mono", monospace', textAlign: 'center', letterSpacing: '0.05em' }}>
          ETH SWITCH
        </Typography>
        <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5 }}>
          {[...Array(8)].map((_, i) => (
            <Box key={i} sx={{ bgcolor: '#171717', borderRadius: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', pb: 0.25 }}>
              <Box sx={{ width: 8, height: 6, borderRadius: '2px', bgcolor: i < 4 ? 'rgba(16,185,129,0.7)' : '#525252' }} />
            </Box>
          ))}
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 0.5 }}>
          {[...Array(4)].map((_, i) => (
            <Box key={i} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: i < 2 ? '#10b981' : '#f59e0b' }} />
          ))}
        </Box>
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#60a5fa' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// Safety Relay
// ────────────────────────────────────────────────────────────────────
export function SafetyRelayNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(140)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 100,
          width: 120,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(244,63,94,0.5)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          p: 1,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Box sx={{ width: 32, height: 32, borderRadius: 1, bgcolor: 'rgba(244,63,94,0.2)', border: 1, borderColor: 'rgba(244,63,94,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ fontSize: 10, fontWeight: 900, color: '#fb7185' }}>S</Typography>
          </Box>
          <Box sx={{ width: 32, height: 32, borderRadius: 1, bgcolor: 'rgba(245,158,11,0.2)', border: 1, borderColor: 'rgba(245,158,11,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ fontSize: 10, fontWeight: 900, color: '#fbbf24' }}>R</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'rgba(244,63,94,0.6)' }} />
          <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'rgba(244,63,94,0.6)' }} />
          <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'rgba(16,185,129,0.6)' }} />
        </Box>
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#fb7185' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sensor
// ────────────────────────────────────────────────────────────────────
export function SensorNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(110)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 85,
          width: 85,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(16,185,129,0.5)',
          borderRadius: '50%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            bgcolor: '#171717',
            border: 1,
            borderColor: 'rgba(16,185,129,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              bgcolor: 'rgba(16,185,129,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#34d399', boxShadow: '0 0 6px #10b981' }} />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Box sx={{ width: 12, height: 4, bgcolor: 'rgba(16,185,129,0.5)', borderRadius: 999 }} />
          <Box sx={{ width: 12, height: 4, bgcolor: 'rgba(16,185,129,0.5)', borderRadius: 999 }} />
        </Box>
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#34d399' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// IPC (Industrial PC)
// ────────────────────────────────────────────────────────────────────
export function IPCNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(160)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 100,
          width: 140,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(168,85,247,0.5)',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          p: 1,
          gap: 0.5,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box
          sx={{
            flex: 1,
            bgcolor: '#0a0a0a',
            borderRadius: 1,
            border: 1,
            borderColor: '#404040',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 32,
              bgcolor: 'rgba(168,85,247,0.1)',
              border: 1,
              borderColor: 'rgba(168,85,247,0.3)',
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography sx={{ fontSize: 8, fontWeight: 700, color: '#c084fc', fontFamily: '"JetBrains Mono", monospace' }}>
              SCADA
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'rgba(16,185,129,0.8)' }} />
          <Box sx={{ width: 12, height: 6, bgcolor: '#525252', borderRadius: 999 }} />
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'rgba(59,130,246,0.8)' }} />
        </Box>
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#c084fc' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// Safety PLC
// ────────────────────────────────────────────────────────────────────
export function SafetyPLCNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(170)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 120,
          width: 150,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(234,179,8,0.5)',
          borderRadius: 4,
          display: 'flex',
          overflow: 'hidden',
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box sx={{ width: '30%', height: '100%', borderRight: 1, borderColor: '#404040', bgcolor: '#171717', p: 0.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981', boxShadow: '0 0 6px #10b981' }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#eab308', boxShadow: '0 0 6px #eab308' }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#f43f5e' }} />
          </Box>
        </Box>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', bgcolor: '#404040', px: 0.5, py: 0.5 }}>
          {[...Array(6)].map((_, i) => (
            <Box key={i} sx={{ flex: 1, bgcolor: '#262626', borderRadius: '2px' }} />
          ))}
        </Box>
        <Box sx={{ width: '25%', height: '100%', bgcolor: 'rgba(234,179,8,0.1)', borderLeft: 1, borderColor: 'rgba(234,179,8,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontSize: 8, fontWeight: 900, color: '#eab308', transform: 'rotate(90deg)', letterSpacing: '0.2em' }}>
            SIL3
          </Typography>
        </Box>
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#eab308' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// Circuit Breaker
// ────────────────────────────────────────────────────────────────────
export function CircuitBreakerNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(130)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 100,
          width: 100,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(249,115,22,0.5)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          p: 1,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 24,
            bgcolor: '#0a0a0a',
            borderRadius: 1,
            border: 1,
            borderColor: 'rgba(249,115,22,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <Box sx={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', width: 12, height: 8, bgcolor: '#f97316', borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
          <Typography sx={{ fontSize: 7, fontWeight: 900, color: '#fb923c' }}>I{'>'}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 4, height: 24, bgcolor: '#525252', borderRadius: 999, position: 'relative' }}>
            <Box sx={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', width: 10, height: 10, bgcolor: '#f97316', borderRadius: '50%', boxShadow: '0 0 6px #f97316' }} />
          </Box>
          <Typography sx={{ fontSize: 8, fontWeight: 700, color: '#fb923c', fontFamily: '"JetBrains Mono", monospace' }}>
            63A
          </Typography>
        </Box>
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#fb923c' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// Contactor
// ────────────────────────────────────────────────────────────────────
export function ContactorNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(140)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 95,
          width: 115,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(14,165,233,0.5)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.75,
          p: 1,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box sx={{ width: '100%', height: 20, bgcolor: '#0a0a0a', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ width: 32, height: 6, bgcolor: 'rgba(14,165,233,0.6)', borderRadius: 999 }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {['L1', 'L2', 'L3'].map((label) => (
              <Box key={label} sx={{ width: 20, height: 20, borderRadius: 1, bgcolor: '#171717', border: 1, borderColor: 'rgba(14,165,233,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography sx={{ fontSize: 6, fontWeight: 900, color: '#38bdf8' }}>{label}</Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {['T1', 'T2', 'T3'].map((label) => (
              <Box key={label} sx={{ width: 20, height: 20, borderRadius: 1, bgcolor: '#171717', border: 1, borderColor: 'rgba(14,165,233,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography sx={{ fontSize: 6, fontWeight: 900, color: 'rgba(56,189,248,0.4)' }}>{label}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#38bdf8' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// Relay (Intermediate Relay)
// ────────────────────────────────────────────────────────────────────
export function RelayNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(120)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 85,
          width: 95,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(20,184,166,0.5)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          p: 1,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box sx={{ width: '100%', height: 16, bgcolor: '#0a0a0a', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ width: 32, height: 4, bgcolor: 'rgba(20,184,166,0.5)', borderRadius: 999 }} />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
          {[0, 1, 2, 3].map((i) => (
            <Box key={i} sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: '#171717', border: 1, borderColor: 'rgba(20,184,166,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: i < 2 ? 'rgba(20,184,166,0.6)' : 'rgba(20,184,166,0.4)' }} />
            </Box>
          ))}
        </Box>
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#14b8a6' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// E-Stop (Emergency Stop Button)
// ────────────────────────────────────────────────────────────────────
export function EStopNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(110)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 90,
          width: 85,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(239,68,68,0.5)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.75,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box
          sx={{
            width: 48,
            height: 28,
            bgcolor: '#dc2626',
            borderTopLeftRadius: 999,
            borderTopRightRadius: 999,
            boxShadow: '0 0 10px rgba(220,38,38,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography sx={{ fontSize: 7, fontWeight: 900, color: '#fff', letterSpacing: '0.05em' }}>
            STOP
          </Typography>
        </Box>
        <Box sx={{ width: 28, height: 16, bgcolor: '#eab308', borderBottomLeftRadius: 6, borderBottomRightRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ width: 20, height: 6, bgcolor: 'rgba(161,98,7,0.5)', borderRadius: 999 }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#ef4444' }} />
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#ef4444' }} />
        </Box>
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#ef4444' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// Transformer
// ────────────────────────────────────────────────────────────────────
export function TransformerNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(150)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 105,
          width: 130,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(139,92,246,0.5)',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
          p: 1,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        {[
          { label: '480V', opacity: 0.5 },
          { label: '24V', opacity: 0.3 },
        ].map((side) => (
          <Box key={side.label} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ fontSize: 8, fontWeight: 700, color: '#a78bfa', fontFamily: '"JetBrains Mono", monospace' }}>
              {side.label}
            </Typography>
            <Box
              sx={{
                width: 32,
                height: 48,
                bgcolor: '#0a0a0a',
                borderRadius: 1,
                border: 1,
                borderColor: 'rgba(139,92,246,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              <Box
                component="svg"
                width={20}
                height={20}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#a78bfa"
                strokeWidth="1.5"
                sx={{ opacity: side.opacity as number }}
              >
                <path d="M12 3v3m0 12v3M5 12H2m20 0h-3M7.5 7.5l-2-2m13 13l2 2M16.5 7.5l2-2M7.5 16.5l-2 2" />
                <circle cx="12" cy="12" r="3" />
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#a78bfa' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// Fuse
// ────────────────────────────────────────────────────────────────────
export function FuseNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(100)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 80,
          width: 60,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(239,68,68,0.3)',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.75,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box sx={{ width: 20, height: 12, bgcolor: '#525252', borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
        <Box
          sx={{
            width: 16,
            height: 32,
            bgcolor: '#0a0a0a',
            borderRadius: '2px',
            border: 1,
            borderColor: '#404040',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <Box sx={{ width: 2, height: 20, bgcolor: 'rgba(239,68,68,0.6)', borderRadius: 999, position: 'absolute' }} />
          <Box sx={{ width: 10, height: 4, bgcolor: 'rgba(239,68,68,0.4)', borderRadius: 999, position: 'absolute', top: 6 }} />
        </Box>
        <Box sx={{ width: 20, height: 12, bgcolor: '#525252', borderBottomLeftRadius: 4, borderBottomRightRadius: 4 }} />
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#ef4444' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// Disconnect Switch
// ────────────────────────────────────────────────────────────────────
export function DisconnectNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(120)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 90,
          width: 90,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(115,115,115,0.5)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.75,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box sx={{ width: 12, height: 16, bgcolor: '#737373', borderRadius: '2px' }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 8, height: 32, bgcolor: '#525252', borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }} />
          <Box
            sx={{
              width: 32,
              height: 12,
              bgcolor: 'rgba(245,158,11,0.8)',
              borderRadius: '2px',
              transform: 'rotate(12deg)',
              boxShadow: '0 0 6px rgba(245,158,11,0.3)',
            }}
          />
          <Box sx={{ width: 8, height: 32, bgcolor: '#525252', borderTopRightRadius: 4, borderBottomRightRadius: 4 }} />
        </Box>
        <Box sx={{ width: 12, height: 16, bgcolor: '#737373', borderRadius: '2px' }} />
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#d4d4d4' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}
