import type { CSSProperties } from 'react';
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
// Each handle gets `style={{ left/top: pct }}` so they don't pile up at
// the midpoint. The wrapping component should add `group` on hover so
// handles fade in only when the user is interacting with the node.
export function NodeHandles({ selected }: { selected?: boolean }) {
  const baseClass =
    'group-hover:!opacity-100 hover:!opacity-100 hover:!scale-150';
  return (
    <>
      {/* Top edge — power in (target) + feedback out (source) */}
      <Handle
        type="target"
        position={Position.Top}
        id="pwr-top"
        className={baseClass}
        style={{ ...handleStyle('power', selected), left: '30%' }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="fb-top"
        className={baseClass}
        style={{ ...handleStyle('feedback', selected), left: '70%' }}
      />

      {/* Right edge — network out (source) + safety out (source) */}
      <Handle
        type="source"
        position={Position.Right}
        id="net-right"
        className={baseClass}
        style={{ ...handleStyle('network', selected), top: '35%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="safe-right"
        className={baseClass}
        style={{ ...handleStyle('safety', selected), top: '70%' }}
      />

      {/* Bottom edge — power out (source) + feedback in (target) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="pwr-bottom"
        className={baseClass}
        style={{ ...handleStyle('power', selected), left: '30%' }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="fb-bottom"
        className={baseClass}
        style={{ ...handleStyle('feedback', selected), left: '70%' }}
      />

      {/* Left edge — network in (target) + safety in (target) */}
      <Handle
        type="target"
        position={Position.Left}
        id="net-left"
        className={baseClass}
        style={{ ...handleStyle('network', selected), top: '35%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="safe-left"
        className={baseClass}
        style={{ ...handleStyle('safety', selected), top: '70%' }}
      />
    </>
  );
}

export function PLCNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[180px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[120px] w-[150px] bg-neutral-800 border-2 rounded-2xl flex overflow-hidden transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-indigo-500/50 shadow-xl'
        }`}
      >
        <div className="w-1/3 h-full border-r border-neutral-700 bg-neutral-900 p-2 flex flex-col gap-2">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]" />
          </div>
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-rose-500 rounded-full" />
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-[2px] bg-neutral-700 px-1 py-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex-1 bg-neutral-800 rounded-[2px]" />
          ))}
        </div>
        <div className="flex-1 flex flex-col gap-[2px] bg-neutral-700 px-1 py-1 border-l border-neutral-600">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex-1 bg-neutral-800 rounded-[2px]" />
          ))}
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-indigo-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

export function HMINode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[180px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[120px] w-[160px] bg-neutral-950 border-4 rounded-[1.5rem] flex items-center justify-center p-2 relative transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-neutral-700 shadow-xl'
        }`}
      >
        <div
          className={`w-full h-full bg-neutral-800/80 border rounded-xl flex items-center justify-center ${
            selected ? 'border-indigo-500/50' : 'border-neutral-700'
          }`}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke={selected ? '#a5b4fc' : '#818cf8'}
            strokeWidth="2"
          >
            <path d="M11 11V7a2 2 0 012-2v0a2 2 0 012 2v2M15 11v-1a2 2 0 012-2v0a2 2 0 012 2v4a6 6 0 01-6 6h-2a6 6 0 01-6-6v-5a2 2 0 012-2h0a2 2 0 012 2v3" />
          </svg>
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-indigo-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

export function IONode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[180px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[120px] w-[140px] bg-neutral-800 border-2 rounded-2xl flex overflow-hidden transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-neutral-700 shadow-xl'
        }`}
      >
        <div
          className={`w-8 h-full bg-amber-500/90 border-r flex flex-col gap-1 items-center py-3 ${
            selected ? 'border-indigo-400' : 'border-neutral-700'
          }`}
        >
          <div
            className={`w-4 h-4 bg-neutral-900 rounded-full border-2 ${
              selected ? 'border-indigo-400' : 'border-amber-300/50'
            }`}
          />
        </div>
        <div className="flex-1 h-full grid grid-cols-4 gap-1 p-1 bg-neutral-700">
          {[...Array(32)].map((_, i) => (
            <div
              key={i}
              className={`w-full h-full rounded-[2px] ${
                i % 5 === 0
                  ? 'bg-emerald-500/80 shadow-[0_0_4px_#10b981]'
                  : i % 7 === 0
                  ? 'bg-rose-500/80 shadow-[0_0_4px_#f43f5e]'
                  : 'bg-neutral-800'
              }`}
            />
          ))}
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-indigo-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

export function VFDNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[120px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[130px] w-[80px] bg-neutral-800 border-2 rounded-2xl flex flex-col items-center p-2 transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-neutral-700 shadow-xl'
        }`}
      >
        <div className="w-full h-6 bg-neutral-950 rounded-t-lg mb-2" />
        <div className="w-full h-8 bg-emerald-950/50 border border-emerald-500/30 mb-2 flex items-center justify-center text-[10px] text-emerald-400 font-mono rounded-sm">
          50.0Hz
        </div>
        <div className="grid grid-cols-2 gap-2 w-full px-2">
          <div className="h-3 bg-rose-500/80 rounded-full" />
          <div className="h-3 bg-emerald-500/80 rounded-full" />
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-indigo-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

// ===== 伺服驱动器 Servo Drive =====
export function ServoNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[160px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[110px] w-[140px] bg-neutral-800 border-2 rounded-2xl flex flex-col items-center justify-center gap-1 p-3 transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-cyan-500/50 shadow-xl'
        }`}
      >
        <div className="w-full h-7 bg-neutral-950 rounded-lg flex items-center justify-center text-[10px] text-cyan-400 font-mono tracking-wider">
          SERVO
        </div>
        <div className="flex gap-2 w-full">
          <div className="flex-1 h-10 bg-neutral-900 rounded-lg flex flex-col items-center justify-center gap-0.5">
            <div className="w-8 h-1 bg-cyan-500/60 rounded-full" />
            <div className="w-8 h-1 bg-cyan-500/40 rounded-full" />
            <div className="w-8 h-1 bg-cyan-500/20 rounded-full" />
          </div>
          <div className="w-8 h-10 bg-neutral-900 rounded-lg flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-cyan-500/60 flex items-center justify-center">
              <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-cyan-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

// ===== 开关电源 Power Supply =====
export function PowerNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[140px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[90px] w-[120px] bg-neutral-800 border-2 rounded-xl flex flex-col justify-center gap-1.5 p-2 transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-amber-500/50 shadow-xl'
        }`}
      >
        <div className="flex items-center justify-between px-1">
          <span className="text-[9px] font-bold text-amber-400 font-mono">24V</span>
          <span className="text-[9px] font-bold text-amber-400 font-mono">10A</span>
        </div>
        <div className="flex-1 bg-neutral-900 rounded-lg flex items-center justify-center">
          <div className="w-12 h-2 bg-amber-500/40 rounded-full relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] text-amber-400/60 font-mono">~</div>
          </div>
        </div>
        <div className="flex gap-2 justify-center">
          <div className="w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
          </div>
          <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
          </div>
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-amber-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

// ===== 工业交换机 Industrial Switch =====
export function SwitchNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[160px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[100px] w-[145px] bg-neutral-800 border-2 rounded-2xl flex flex-col p-2 gap-1 transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-blue-500/50 shadow-xl'
        }`}
      >
        <div className="text-[9px] font-bold text-blue-400 font-mono text-center tracking-wider">ETH SWITCH</div>
        <div className="flex-1 grid grid-cols-4 gap-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-neutral-900 rounded-md flex items-end justify-center pb-0.5">
              <div className={`w-2 h-1.5 rounded-sm ${i < 4 ? 'bg-emerald-500/70' : 'bg-neutral-600'}`} />
            </div>
          ))}
        </div>
        <div className="flex justify-between px-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < 2 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          ))}
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-blue-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

// ===== 安全继电器 Safety Relay =====
export function SafetyRelayNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[140px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[100px] w-[120px] bg-neutral-800 border-2 rounded-2xl flex flex-col items-center justify-center gap-2 p-2 transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-rose-500/50 shadow-xl'
        }`}
      >
        <div className="flex gap-2">
          <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
            <span className="text-[10px] font-black text-rose-400">S</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
            <span className="text-[10px] font-black text-amber-400">R</span>
          </div>
        </div>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-rose-500/60" />
          <div className="w-3 h-3 rounded-full bg-rose-500/60" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-rose-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

// ===== 传感器 Sensor =====
export function SensorNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[110px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[85px] w-[85px] bg-neutral-800 border-2 rounded-full flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-emerald-500/50 shadow-xl'
        }`}
      >
        <div className="w-8 h-8 rounded-full bg-neutral-900 border border-emerald-500/30 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full bg-emerald-500/40 flex items-center justify-center">
            <div className="w-2 h-2 bg-emerald-400 rounded-full shadow-[0_0_6px_#10b981]" />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="w-3 h-1 bg-emerald-500/50 rounded-full" />
          <div className="w-3 h-1 bg-emerald-500/50 rounded-full" />
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-emerald-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

// ===== 工控机 IPC =====
export function IPCNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[160px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[100px] w-[140px] bg-neutral-800 border-2 rounded-xl flex flex-col p-2 gap-1 transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-purple-500/50 shadow-xl'
        }`}
      >
        <div className="flex-1 bg-neutral-950 rounded-lg border border-neutral-700 flex items-center justify-center">
          <div className="w-14 h-8 bg-purple-500/10 border border-purple-500/30 rounded-md flex items-center justify-center">
            <span className="text-[8px] font-bold text-purple-400 font-mono">SCADA</span>
          </div>
        </div>
        <div className="flex justify-between px-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500/80" />
          <div className="w-3 h-1.5 bg-neutral-600 rounded-full" />
          <div className="w-2 h-2 rounded-full bg-blue-500/80" />
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-purple-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

// ===== 安全PLC Safety PLC =====
export function SafetyPLCNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[170px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[120px] w-[150px] bg-neutral-800 border-2 rounded-2xl flex overflow-hidden transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-yellow-500/50 shadow-xl'
        }`}
      >
        <div className="w-[30%] h-full border-r border-neutral-700 bg-neutral-900 p-1.5 flex flex-col gap-1.5">
          <div className="flex gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_6px_#10b981]" /></div>
          <div className="flex gap-1"><div className="w-2 h-2 bg-yellow-500 rounded-full shadow-[0_0_6px_#eab308]" /></div>
          <div className="flex gap-1"><div className="w-2 h-2 bg-rose-500 rounded-full" /></div>
        </div>
        <div className="flex-1 flex flex-col gap-[2px] bg-neutral-700 px-1 py-1">
          {[...Array(6)].map((_, i) => <div key={i} className="flex-1 bg-neutral-800 rounded-[2px]" />)}
        </div>
        <div className="w-[25%] h-full bg-yellow-500/10 border-l border-yellow-500/30 flex items-center justify-center">
          <span className="text-[8px] font-black text-yellow-500 rotate-90 tracking-[0.2em]">SIL3</span>
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-yellow-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

// ===== 断路器 Circuit Breaker =====
export function CircuitBreakerNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[130px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[100px] w-[100px] bg-neutral-800 border-2 rounded-2xl flex flex-col items-center justify-center gap-2 p-2 transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-orange-500/50 shadow-xl'
        }`}
      >
        <div className="w-10 h-6 bg-neutral-950 rounded-md border border-orange-500/40 flex items-center justify-center relative">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-2 bg-orange-500 rounded-t-sm" />
          <span className="text-[7px] font-black text-orange-400">I{'>'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1 h-6 bg-neutral-600 rounded-full relative">
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-orange-500 rounded-full shadow-[0_0_6px_#f97316]" />
          </div>
          <div className="text-[8px] font-bold text-orange-400 font-mono">63A</div>
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-orange-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

// ===== 接触器 Contactor =====
export function ContactorNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[140px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[95px] w-[115px] bg-neutral-800 border-2 rounded-2xl flex flex-col items-center justify-center gap-1.5 p-2 transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-sky-500/50 shadow-xl'
        }`}
      >
        <div className="w-full h-5 bg-neutral-950 rounded-lg flex items-center justify-center">
          <div className="w-8 h-1.5 bg-sky-500/60 rounded-full" />
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col gap-1">
            <div className="w-5 h-5 rounded-md bg-neutral-900 border border-sky-500/30 flex items-center justify-center">
              <span className="text-[6px] font-black text-sky-400">L1</span>
            </div>
            <div className="w-5 h-5 rounded-md bg-neutral-900 border border-sky-500/30 flex items-center justify-center">
              <span className="text-[6px] font-black text-sky-400">L2</span>
            </div>
            <div className="w-5 h-5 rounded-md bg-neutral-900 border border-sky-500/30 flex items-center justify-center">
              <span className="text-[6px] font-black text-sky-400">L3</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="w-5 h-5 rounded-md bg-neutral-900 border border-sky-500/20 flex items-center justify-center">
              <span className="text-[6px] font-black text-sky-500/40">T1</span>
            </div>
            <div className="w-5 h-5 rounded-md bg-neutral-900 border border-sky-500/20 flex items-center justify-center">
              <span className="text-[6px] font-black text-sky-500/40">T2</span>
            </div>
            <div className="w-5 h-5 rounded-md bg-neutral-900 border border-sky-500/20 flex items-center justify-center">
              <span className="text-[6px] font-black text-sky-500/40">T3</span>
            </div>
          </div>
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-sky-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

// ===== 中间继电器 Relay =====
export function RelayNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[120px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[85px] w-[95px] bg-neutral-800 border-2 rounded-2xl flex flex-col items-center justify-center gap-1 p-2 transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-teal-500/50 shadow-xl'
        }`}
      >
        <div className="w-full h-4 bg-neutral-950 rounded-md flex items-center justify-center">
          <div className="w-8 h-1 bg-teal-500/50 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="w-6 h-6 rounded-md bg-neutral-900 border border-teal-500/20 flex items-center justify-center">
            <div className="w-2 h-2 rounded-sm bg-teal-500/60" />
          </div>
          <div className="w-6 h-6 rounded-md bg-neutral-900 border border-teal-500/20 flex items-center justify-center">
            <div className="w-2 h-2 rounded-sm bg-teal-500/60" />
          </div>
          <div className="w-6 h-6 rounded-md bg-neutral-900 border border-teal-500/20 flex items-center justify-center">
            <div className="w-2 h-2 rounded-sm bg-teal-500/40" />
          </div>
          <div className="w-6 h-6 rounded-md bg-neutral-900 border border-teal-500/20 flex items-center justify-center">
            <div className="w-2 h-2 rounded-sm bg-teal-500/40" />
          </div>
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-teal-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

// ===== 急停按钮 E-Stop =====
export function EStopNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[110px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[90px] w-[85px] bg-neutral-800 border-2 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-red-500/50 shadow-xl'
        }`}
      >
        <div className="w-12 h-7 bg-red-600 rounded-t-full shadow-[0_0_10px_rgba(220,38,38,0.4)] flex items-center justify-center">
          <span className="text-[7px] font-black text-white tracking-wider">STOP</span>
        </div>
        <div className="w-7 h-4 bg-yellow-500 rounded-b-md flex items-center justify-center">
          <div className="w-5 h-1.5 bg-yellow-700/50 rounded-full" />
        </div>
        <div className="flex gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-red-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

// ===== 变压器 Transformer =====
export function TransformerNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[150px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[105px] w-[130px] bg-neutral-800 border-2 rounded-2xl flex items-center justify-center gap-3 p-2 transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-violet-500/50 shadow-xl'
        }`}
      >
        <div className="flex flex-col items-center gap-1">
          <span className="text-[8px] font-bold text-violet-400 font-mono">480V</span>
          <div className="w-8 h-12 bg-neutral-950 rounded-lg border border-violet-500/30 flex items-center justify-center relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5" opacity="0.5">
                <path d="M12 3v3m0 12v3M5 12H2m20 0h-3M7.5 7.5l-2-2m13 13l2 2M16.5 7.5l2-2M7.5 16.5l-2 2" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[8px] font-bold text-violet-400 font-mono">24V</span>
          <div className="w-8 h-12 bg-neutral-950 rounded-lg border border-violet-500/30 flex items-center justify-center relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5" opacity="0.3">
                <path d="M12 3v3m0 12v3M5 12H2m20 0h-3M7.5 7.5l-2-2m13 13l2 2M16.5 7.5l2-2M7.5 16.5l-2 2" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-violet-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

// ===== 熔断器 Fuse =====
export function FuseNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[100px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[80px] w-[60px] bg-neutral-800 border-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-red-500/30 shadow-xl'
        }`}
      >
        <div className="w-5 h-3 bg-neutral-600 rounded-t-sm" />
        <div className="w-4 h-8 bg-neutral-950 rounded-sm border border-neutral-700 flex items-center justify-center relative">
          <div className="w-0.5 h-5 bg-red-500/60 rounded-full absolute" />
          <div className="w-2.5 h-1 bg-red-500/40 rounded-full absolute top-1.5" />
        </div>
        <div className="w-5 h-3 bg-neutral-600 rounded-b-sm" />
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-red-400' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}

// ===== 隔离开关 Disconnect Switch =====
export function DisconnectNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="w-[120px] text-center flex flex-col items-center group">
      <NodeHandles selected={selected} />
      <div
        className={`h-[90px] w-[90px] bg-neutral-800 border-2 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all duration-200 ${
          selected
            ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]'
            : 'border-gray-500/50 shadow-xl'
        }`}
      >
        <div className="w-3 h-4 bg-neutral-500 rounded-sm" />
        <div className="flex items-center gap-1">
          <div className="w-2 h-8 bg-neutral-600 rounded-l-sm" />
          <div className="w-8 h-3 bg-amber-500/80 rounded-sm rotate-12 transform origin-center shadow-[0_0_6px_rgba(245,158,11,0.3)]" />
          <div className="w-2 h-8 bg-neutral-600 rounded-r-sm" />
        </div>
        <div className="w-3 h-4 bg-neutral-500 rounded-sm" />
      </div>
      <span
        className={`mt-4 font-bold uppercase text-xs tracking-wider transition-colors ${
          selected ? 'text-gray-300' : 'text-neutral-300'
        }`}
      >
        {data.label}
      </span>
    </div>
  );
}
