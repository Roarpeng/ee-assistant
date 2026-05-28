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
  const color = HANDLE_COLOR[category] || '#737373';
  return {
    background: color,
    borderColor: selected ? '#ffffff' : '#171717',
    boxShadow: selected ? `0 0 10px ${color}` : `0 0 4px ${color}80`,
    width: 9,
    height: 9,
    borderRadius: 9,
    borderWidth: 1.5,
    borderStyle: 'solid',
    transition: 'opacity 200ms, transform 200ms, box-shadow 200ms',
    opacity: selected ? 1 : 0.45,
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
      {/* Top edge — Power connection (merged src/tgt) */}
      <Handle
        type="target"
        position={Position.Top}
        id="pwr-tgt"
        style={{ ...handleStyle('power', selected), left: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="pwr-src"
        style={{ ...handleStyle('power', selected), left: '50%' }}
      />

      {/* Right edge — Bus/Network connection (merged src/tgt) */}
      <Handle
        type="target"
        position={Position.Right}
        id="net-tgt"
        style={{ ...handleStyle('network', selected), top: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="net-src"
        style={{ ...handleStyle('network', selected), top: '50%' }}
      />

      {/* Left edge — Hardwired/Safety/Feedback connection (merged src/tgt) */}
      <Handle
        type="target"
        position={Position.Left}
        id="wired-tgt"
        style={{ ...handleStyle('feedback', selected), top: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="wired-src"
        style={{ ...handleStyle('feedback', selected), top: '50%' }}
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
      <svg width="150" height="120" viewBox="0 0 150 120" style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }}>
        {/* Main Body */}
        <rect x="2" y="2" width="146" height="116" rx="6" fill="#1e1e1e" stroke={selected ? '#818cf8' : '#334155'} strokeWidth="3" />
        {/* CPU Logo Area */}
        <rect x="10" y="10" width="40" height="100" rx="3" fill="#111827" stroke="#4b5563" strokeWidth="1" />
        <text x="30" y="30" textAnchor="middle" fill="#818cf8" fontSize="8" fontWeight="bold">CPU</text>
        {/* CPU Status LED */}
        <circle cx="30" cy="50" r="3" fill="#10b981" />
        <circle cx="30" cy="62" r="3" fill="#ef4444" />
        {/* IO Channels Grid */}
        <rect x="60" y="10" width="36" height="100" rx="2" fill="#2d3748" />
        <rect x="104" y="10" width="36" height="100" rx="2" fill="#2d3748" />
        {/* Terminal Block Simulator Lines */}
        {Array.from({ length: 8 }).map((_, i) => (
          <g key={i}>
            <line x1="64" y1={18 + i * 12} x2="92" y2={18 + i * 12} stroke="#4a5568" strokeWidth="2" />
            <line x1="108" y1={18 + i * 12} x2="136" y2={18 + i * 12} stroke="#4a5568" strokeWidth="2" />
            {/* Active channel indicator */}
            {i % 3 === 0 && <circle cx="86" cy={18 + i * 12} r="2" fill="#10b981" />}
          </g>
        ))}
      </svg>
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
      <svg width="160" height="120" viewBox="0 0 160 120" style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }}>
        <rect x="2" y="2" width="156" height="116" rx="12" fill="#0f172a" stroke={selected ? '#818cf8' : '#334155'} strokeWidth="4" />
        {/* Screen area */}
        <rect x="12" y="12" width="136" height="96" rx="4" fill="#1e293b" stroke="#475569" strokeWidth="2" />
        {/* Graphic content */}
        <path d="M30 70 L60 40 L90 55 L130 30" fill="none" stroke="#60a5fa" strokeWidth="2.5" />
        <circle cx="30" cy="70" r="3.5" fill="#3b82f6" />
        <circle cx="60" cy="40" r="3.5" fill="#3b82f6" />
        <circle cx="90" cy="55" r="3.5" fill="#3b82f6" />
        <circle cx="130" cy="30" r="3.5" fill="#3b82f6" />
        {/* Bottom brand logo line */}
        <line x1="60" y1="112" x2="100" y2="112" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
      </svg>
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
      <svg width="140" height="120" viewBox="0 0 140 120" style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }}>
        <rect x="2" y="2" width="136" height="116" rx="4" fill="#1e1e1e" stroke={selected ? '#818cf8' : '#334155'} strokeWidth="2" />
        {/* Active side indicator */}
        <rect x="2" y="2" width="30" height="116" rx="2" fill="#fb923c" />
        <circle cx="17" cy="18" r="4" fill="#0f172a" />
        <circle cx="17" cy="18" r="2" fill="#fb923c" />
        {/* Grid points */}
        {Array.from({ length: 16 }).map((_, i) => {
          const x = 44 + (i % 4) * 22;
          const y = 20 + Math.floor(i / 4) * 26;
          const isGreen = i % 5 === 0;
          const isRed = i % 7 === 0 && !isGreen;
          return (
            <g key={i}>
              <rect x={x} y={y} width="16" height="16" rx="2" fill="#2d3748" />
              <circle cx={x + 8} cy={y + 8} r="3" fill={isGreen ? '#10b981' : isRed ? '#f43f5e' : '#1a202c'} />
            </g>
          );
        })}
      </svg>
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
      <svg width="90" height="130" viewBox="0 0 90 130" style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }}>
        <rect x="2" y="2" width="86" height="126" rx="6" fill="#171717" stroke={selected ? '#818cf8' : '#404040'} strokeWidth="2.5" />
        {/* Heat sink top block */}
        <rect x="10" y="10" width="70" height="20" rx="3" fill="#0a0a0a" />
        {/* LED Segment Display Area */}
        <rect x="10" y="38" width="70" height="34" rx="2" fill="#052e16" stroke="#16a34a" strokeWidth="1" />
        <text x="45" y="60" textAnchor="middle" fill="#34d399" fontSize="12" fontWeight="bold" fontFamily="monospace">50.0</text>
        <text x="72" y="48" fill="#34d399" fontSize="6">Hz</text>
        {/* Knobs & Buttons */}
        <circle cx="26" cy="94" r="8" fill="#262626" stroke="#404040" strokeWidth="1.5" />
        <circle cx="26" cy="94" r="2" fill="#f43f5e" />
        {/* Start/Stop Button */}
        <rect x="50" y="86" width="28" height="10" rx="1" fill="#10b981" />
        <rect x="50" y="102" width="28" height="10" rx="1" fill="#ef4444" />
      </svg>
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
      <svg width="140" height="110" viewBox="0 0 140 110" style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }}>
        <rect x="2" y="2" width="136" height="106" rx="4" fill="#262626" stroke={selected ? '#818cf8' : '#06b6d4'} strokeWidth="2.5" />
        <rect x="10" y="10" width="120" height="28" rx="2" fill="#0a0a0a" />
        <text x="70" y="28" textAnchor="middle" fill="#22d3ee" fontSize="10" fontWeight="bold" fontFamily="monospace" letterSpacing="2">SERVO</text>
        {/* Encoder Connector and Motor Drive Shaft Symbol */}
        <rect x="15" y="48" width="60" height="46" rx="2" fill="#171717" />
        {Array.from({ length: 3 }).map((_, i) => (
          <line key={i} x1="25" y1={58 + i * 10} x2="65" y2={58 + i * 10} stroke="#22d3ee" strokeWidth="3" opacity={0.8 - i * 0.2} />
        ))}
        {/* Pulsing indicator */}
        <circle cx="105" cy="71" r="14" fill="#171717" stroke="#0891b2" strokeWidth="1.5" />
        <circle cx="105" cy="71" r="5" fill="#06b6d4" />
      </svg>
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
      <svg width="120" height="90" viewBox="0 0 120 90" style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }}>
        <rect x="2" y="2" width="116" height="86" rx="3" fill="#1e1e1e" stroke={selected ? '#818cf8' : '#fb923c'} strokeWidth="2" />
        {/* Output label */}
        <text x="14" y="20" fill="#f59e0b" fontSize="8" fontWeight="bold" fontFamily="monospace">24V</text>
        <text x="106" y="20" textAnchor="end" fill="#f59e0b" fontSize="8" fontWeight="bold" fontFamily="monospace">10A</text>
        {/* Power Waves */}
        <rect x="14" y="32" width="92" height="24" rx="2" fill="#0a0a0a" />
        <path d="M25 44 C 35 34, 45 54, 55 44 C 65 34, 75 54, 85 44 L 95 44" fill="none" stroke="rgba(245,158,11,0.5)" strokeWidth="2" />
        {/* Indicators */}
        <circle cx="45" cy="72" r="5" fill="#f59e0b" />
        <circle cx="75" cy="72" r="5" fill="#10b981" />
      </svg>
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
      <svg width="145" height="100" viewBox="0 0 145 100" style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }}>
        <rect x="2" y="2" width="141" height="96" rx="4" fill="#1e1e1e" stroke={selected ? '#818cf8' : '#3b82f6'} strokeWidth="2.5" />
        <text x="72" y="16" textAnchor="middle" fill="#60a5fa" fontSize="8" fontWeight="bold" fontFamily="monospace" letterSpacing="1">ETH SWITCH</text>
        {/* RJ45 Ports */}
        {Array.from({ length: 8 }).map((_, i) => {
          const x = 12 + (i % 4) * 32;
          const y = i < 4 ? 26 : 56;
          const isActive = i < 5;
          return (
            <g key={i}>
              <rect x={x} y={y} width="24" height="22" rx="2" fill="#0a0a0a" stroke="#404040" strokeWidth="1" />
              <rect x={x + 6} y={y + 14} width="12" height="8" fill={isActive ? '#10b981' : '#525252'} />
            </g>
          );
        })}
      </svg>
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

// ────────────────────────────────────────────────────────────────────
// Safety Door
// ────────────────────────────────────────────────────────────────────
export function SafetyDoorNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(110)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 90,
          width: 75,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(239,68,68,0.5)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Door panel */}
        <Box
          sx={{
            width: 44,
            height: 50,
            bgcolor: '#404040',
            border: 1.5,
            borderColor: '#ef4444',
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
          }}
        >
          {/* Lock indicator */}
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
          {/* Door handle */}
          <Box sx={{ width: 16, height: 3, bgcolor: '#737373', borderRadius: 1 }} />
        </Box>
        {/* Safety stripes */}
        <Box sx={{ display: 'flex', gap: '2px' }}>
          <Box sx={{ width: 6, height: 3, bgcolor: '#eab308' }} />
          <Box sx={{ width: 6, height: 3, bgcolor: '#171717' }} />
          <Box sx={{ width: 6, height: 3, bgcolor: '#eab308' }} />
          <Box sx={{ width: 6, height: 3, bgcolor: '#171717' }} />
          <Box sx={{ width: 6, height: 3, bgcolor: '#eab308' }} />
        </Box>
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#ef4444' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────
// Signal Light (Tower Light / Beacon)
// ────────────────────────────────────────────────────────────────────
export function SignalLightNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <Box sx={nodeContainerSx(100)}>
      <NodeHandles selected={selected} />
      <Box
        sx={{
          height: 100,
          width: 55,
          bgcolor: '#262626',
          border: 2,
          borderColor: selected ? 'primary.main' : 'rgba(245,158,11,0.5)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          transition: 'all 200ms',
          boxShadow: selected ? '0 0 20px rgba(99,102,241,0.5)' : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Tower light stack */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          {/* Red */}
          <Box sx={{ width: 26, height: 14, bgcolor: '#ef4444', borderRadius: '6px 6px 2px 2px', boxShadow: '0 0 8px rgba(239,68,68,0.5)' }} />
          {/* Yellow */}
          <Box sx={{ width: 26, height: 14, bgcolor: '#eab308', borderRadius: 2, boxShadow: '0 0 6px rgba(234,179,8,0.3)' }} />
          {/* Green */}
          <Box sx={{ width: 26, height: 14, bgcolor: '#10b981', borderRadius: '2px 2px 6px 6px', boxShadow: '0 0 6px rgba(16,185,129,0.3)' }} />
        </Box>
        {/* Pole */}
        <Box sx={{ width: 6, height: 10, bgcolor: '#525252' }} />
        {/* Base */}
        <Box sx={{ width: 20, height: 4, bgcolor: '#737373', borderRadius: 1 }} />
      </Box>
      <Typography sx={{ ...nodeLabelSx(selected), color: selected ? '#f59e0b' : 'text.secondary' }}>{data.label}</Typography>
    </Box>
  );
}

