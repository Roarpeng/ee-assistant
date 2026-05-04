# React Flow Frontend Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Mermaid static diagrams with an interactive React Flow topology canvas, adopting the zip prototype's industrial dark-first UI while preserving CSS variable theming, MVS architecture, and backend API contracts.

**Architecture:** Three-column layout (chat sidebar | drag resizer | canvas+tabs). React Flow manages topology nodes/edges via local state synced to Zustand store with `source: 'ai' | 'user'` discrimination. SSE streaming from `/analyze-v2` delivers AI-generated topology/bom/sclCode payloads. Monaco Editor retained for SCL code.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 3, Zustand 4, React Flow 11, Monaco Editor, Lucide React, Motion

---

### Task 1: Install new dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Add reactflow, lucide-react, motion to package.json**

```bash
cd frontend && npm install reactflow@^11.11.4 lucide-react@^0.546.0 motion@^12.23.24
```

- [ ] **Step 2: Verify install**

```bash
cd frontend && node -e "require('reactflow'); require('lucide-react'); console.log('OK')"
```

Expected: Outputs `OK` with no errors.

---

### Task 2: Expand CSS with industrial dark theme and React Flow overrides

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Replace index.css with expanded theme system**

Replace the entire file content with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* ===== Light Theme (current defaults) ===== */
:root {
  --color-bg-primary: #fafafa;
  --color-bg-secondary: #ffffff;
  --color-bg-tertiary: #f5f5f4;
  --color-bg-canvas: #f0f0f0;
  --color-text-primary: #1a1a2e;
  --color-text-secondary: #6b7280;
  --color-text-tertiary: #9ca3af;
  --color-border: #e5e7eb;
  --color-border-light: #f3f4f6;
  --color-accent: #6366f1;
  --color-accent-hover: #4f46e5;
  --color-accent-light: rgba(99, 102, 241, 0.1);
  --color-success: #059669;
  --color-success-light: #ecfdf5;
  --color-warning: #d97706;
  --color-warning-light: #fffbeb;
  --color-error: #dc2626;
  --color-error-light: #fef2f2;
  --color-node-plc: #6366f1;
  --color-node-hmi: #8b5cf6;
  --color-node-io: #f59e0b;
  --color-node-vfd: #10b981;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 20px;
  --radius-2xl: 40px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.07);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08);
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}

/* ===== Dark Theme (zip industrial palette) ===== */
[data-theme="dark"] {
  --color-bg-primary: #0a0a0a;
  --color-bg-secondary: #171717;
  --color-bg-tertiary: #262626;
  --color-bg-canvas: #111111;
  --color-text-primary: #fafafa;
  --color-text-secondary: #a3a3a3;
  --color-text-tertiary: #737373;
  --color-border: #404040;
  --color-border-light: #262626;
  --color-accent: #6366f1;
  --color-accent-hover: #818cf8;
  --color-accent-light: rgba(99, 102, 241, 0.1);
  --color-success: #10b981;
  --color-success-light: rgba(16, 185, 129, 0.1);
  --color-warning: #f59e0b;
  --color-warning-light: rgba(245, 158, 11, 0.1);
  --color-error: #f43f5e;
  --color-error-light: rgba(244, 63, 94, 0.1);
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.4);
  --shadow-lg: 0 10px 25px rgba(0,0,0,0.5);
}

body {
  margin: 0;
  font-family: var(--font-sans);
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

/* ===== Custom Scrollbar ===== */
.custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; border-radius: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--color-text-tertiary); }

/* ===== React Flow Dark Overrides ===== */
.react-flow-dark .react-flow__controls button {
  background: #262626;
  border-bottom: 1px solid #404040;
  fill: #a3a3a3;
}
.react-flow-dark .react-flow__controls button:hover {
  background: #404040;
  fill: #fafafa;
}

.react-flow-dark .react-flow__edge.selected path.react-flow__edge-path {
  stroke: #818cf8 !important;
  stroke-width: 3 !important;
}

.react-flow-dark .react-flow__edge.selected text {
  fill: #c7d2fe !important;
}

.react-flow-dark .react-flow__edge.selected rect {
  fill: #3730a3 !important;
}

.react-flow-dark .react-flow__edge.selected polygon {
  fill: #818cf8 !important;
  stroke: #818cf8 !important;
}

.react-flow-dark .react-flow__minimap {
  background-color: #171717 !important;
}

.react-flow-dark .react-flow__minimap-mask {
  fill: #262626 !important;
}

.react-flow-dark .react-flow__background pattern circle {
  fill: #525252 !important;
}
```

- [ ] **Step 2: Delete old CSS files if any remain**

No old files to remove — the previous `index.css` is being fully replaced.

---

### Task 3: Rewrite Zustand store

**Files:**
- Modify: `frontend/src/models/store.ts`
- Remove: `frontend/src/models/project.ts`, `frontend/src/models/selection.ts`, `frontend/src/models/schematic.ts`, `frontend/src/models/codegen.ts` (merged into store)

- [ ] **Step 1: Rewrite store.ts with topology/bom/sclCode + existing state**

Replace the entire file content with:

```typescript
import { create } from 'zustand';

// ===== Topology Types =====
export type NodeData = {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  status?: 'ok' | 'warning' | 'error';
  details?: Record<string, string>;
};

export type EdgeData = {
  id: string;
  source: string;
  target: string;
  protocol: string;
};

// ===== BOM Types =====
export type BOMItem = {
  id: string;
  name: string;
  mfg: string;
  pn: string;
  qty: number;
  specs: string;
  active?: boolean;
};

// ===== App State =====
export type AnalysisStage =
  | 'idle'
  | 'analyzing'
  | 'selecting'
  | 'generating_schematic'
  | 'generating_code'
  | 'done';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface AppState {
  // Topology
  topology: { nodes: NodeData[]; edges: EdgeData[]; source?: 'ai' | 'user' };

  // BOM
  bom: BOMItem[];

  // SCL Code
  sclCode: string;

  // Project & Analysis
  project: { id: string; name: string } | null;
  stage: AnalysisStage;
  messages: ChatMessage[];

  // UI
  activeCanvasTab: 'topology' | 'bom' | 'code';
  theme: 'light' | 'dark';

  // Actions
  setTopology: (nodes: NodeData[], edges: EdgeData[], source?: 'ai' | 'user') => void;
  setBOM: (bom: BOMItem[]) => void;
  setSCLCode: (code: string) => void;
  setProject: (p: { id: string; name: string }) => void;
  setStage: (s: AnalysisStage) => void;
  addMessage: (m: ChatMessage) => void;
  setActiveCanvasTab: (tab: 'topology' | 'bom' | 'code') => void;
  toggleTheme: () => void;
}

let msgCounter = 0;

export const useStore = create<AppState>((set) => ({
  topology: {
    nodes: [
      { id: 'plc', type: 'plc', label: 'PLC (Main)', x: 50, y: 80 },
      { id: 'hmi', type: 'hmi', label: 'HMI (Touch Panel)', x: 500, y: 80 },
      { id: 'io', type: 'io', label: 'Remote IO (Safety)', x: 700, y: 200 },
      { id: 'vfd1', type: 'vfd', label: 'VFD (1)', x: 180, y: 350 },
      { id: 'vfd2', type: 'vfd', label: 'VFD (2)', x: 500, y: 350 },
      { id: 'vfd3', type: 'vfd', label: 'VFD (3)', x: 700, y: 350 },
    ],
    edges: [
      { id: 'e1', source: 'plc', target: 'hmi', protocol: 'PROFINET' },
      { id: 'e2', source: 'plc', target: 'io', protocol: 'ETHERCAT' },
      { id: 'e3', source: 'plc', target: 'vfd3', protocol: 'MODBUS TCP' },
      { id: 'e4', source: 'plc', target: 'vfd2', protocol: 'PROFINET' },
      { id: 'e5', source: 'plc', target: 'vfd1', protocol: 'PROFINET' },
    ],
  },
  bom: [
    { id: '001', name: 'Resistor, Thick Film', mfg: 'Yageo', pn: 'RC0603FR-077K21L', qty: 20, specs: '1.21kΩ, ±1%, 1/10W, 0603' },
    { id: '002', name: 'Capacitor, Ceramic', mfg: 'Murata', pn: 'GRM188R71E105KA12D', qty: 10, specs: '1µF, ±10%, 25V, X7R, 0603' },
    { id: '003', name: 'Microcontroller', mfg: 'Microchip Technology', pn: 'ATmega328P-AU', qty: 1, specs: '8-bit AVR, 32KB Flash, 22-pin TQFP' },
    { id: '004', name: 'Connector, Header', mfg: 'Molex', pn: '22-23-2041', qty: 2, specs: '4 Position, 2.54mm Pitch, Through Hole' },
    { id: '005', name: 'MOSFET, N-Channel', mfg: 'Infineon Technologies', pn: 'IRLZ44N', qty: 4, specs: '55V, 47A, 22mΩ, TO-220AB' },
    { id: '006', name: 'Voltage Regulator', mfg: 'Texas Instruments', pn: 'LM7805CT', qty: 1, specs: 'Linear, 5V Output, 1.5A, TO-220' },
    { id: '007', name: 'Relay, Signal', mfg: 'Omron Electronics', pn: 'G6K-2F-Y-DC5', qty: 3, specs: 'DPDT, 5VDC Coil, Surface Mount' },
  ],
  sclCode: `FUNCTION_BLOCK FB_ConveyorControl_V2\nVAR_INPUT\n    bStart  : BOOL;\n    bStop   : BOOL;\n    bESTOP  : BOOL; // Emergency Stop\nEND_VAR\nVAR_OUTPUT\n    bMotorOn         : BOOL;\n    bConveyorRunning : BOOL;\nEND_VAR\nVAR\n    bSystemReady : BOOL;\nEND_VAR\n\n(* Main Control Logic for Conveyor System *)\n// Safety Check\nbSystemReady := NOT bESTOP;\n\n// Running Logic\nIF bSystemReady AND bStart AND NOT bStop THEN\n    bConveyorRunning := TRUE;\nELSIF NOT bSystemReady OR bStop THEN\n    bConveyorRunning := FALSE;\nEND_IF;\n\nbMotorOn := bConveyorRunning;\nEND_FUNCTION_BLOCK`,

  project: null,
  stage: 'idle',
  messages: [],
  activeCanvasTab: 'topology',
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'dark',

  setTopology: (nodes, edges, source = 'user') =>
    set({ topology: { nodes, edges, source } }),
  setBOM: (bom) => set({ bom }),
  setSCLCode: (sclCode) => set({ sclCode }),
  setProject: (p) => set({ project: p }),
  setStage: (stage) => set({ stage }),
  addMessage: (m) =>
    set((s) => ({
      messages: [...s.messages, { ...m, id: String(++msgCounter), timestamp: Date.now() }],
    })),
  setActiveCanvasTab: (tab) => set({ activeCanvasTab: tab }),
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      document.documentElement.setAttribute('data-theme', next);
      return { theme: next };
    }),
}));
```

---

### Task 4: Update API service

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Add analyze-v2 SSE endpoint and topology-code sync**

Replace the entire file content with:

```typescript
const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Projects
  createProject: (name: string) =>
    request<{ id: string; name: string }>(`/projects?name=${encodeURIComponent(name)}`, { method: 'POST' }),

  getProject: (id: string) => request<any>(`/projects/${id}`),

  listProjects: () => request<any[]>(`/projects`),

  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),

  // Analysis (v1 serial — fallback)
  analyze: (projectId: string, text: string) =>
    request<any>(`/projects/${projectId}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  // Analysis v2 (LangGraph via SSE — primary)
  analyzeV2SSE: (projectId: string, message: string) =>
    fetch(`${BASE}/projects/${projectId}/analyze-v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }),

  // Topology → Code sync
  updateCodeFromTopology: (projectId: string, topology: { nodes: any[]; edges: any[] }) =>
    request<{ sclCode: string }>(`/projects/${projectId}/codegen`, {
      method: 'POST',
      body: JSON.stringify({ topology }),
    }),

  // Knowledge
  uploadKnowledgeDoc: (formData: FormData) =>
    fetch(`${BASE}/knowledge/docs`, { method: 'POST', body: formData }),

  searchKnowledge: (query: string, filters?: { category?: string[]; manufacturer?: string }) =>
    request<any>(`/knowledge/search`, {
      method: 'POST',
      body: JSON.stringify({ query, category_filter: filters?.category, manufacturer_filter: filters?.manufacturer, top_k: 5 }),
    }),

  listKnowledgeDocs: () => request<any[]>(`/knowledge/docs`),

  deleteKnowledgeDoc: (id: string) => request<void>(`/knowledge/docs/${id}`, { method: 'DELETE' }),
};
```

---

### Task 5: Create CustomNodes component

**Files:**
- Create: `frontend/src/views/components/CustomNodes.tsx`

- [ ] **Step 1: Create custom React Flow nodes**

```typescript
import { Handle, Position } from 'reactflow';

function handleClass(selected?: boolean) {
  return `!w-3 !h-3 transition-all duration-200 z-50 rounded-full ${
    selected
      ? '!bg-indigo-400 !border-2 !border-white scale-150 shadow-[0_0_10px_rgba(129,140,248,1)] !opacity-100'
      : '!bg-neutral-500 !border-2 !border-neutral-900 !opacity-0 group-hover:!opacity-100'
  }`;
}

export function NodeHandles({ selected }: { selected?: boolean }) {
  return (
    <>
      <Handle type="target" position={Position.Top} id="in-top" className={handleClass(selected)} />
      <Handle type="source" position={Position.Right} id="out" className={handleClass(selected)} />
      <Handle type="source" position={Position.Bottom} id="out-bottom" className={handleClass(selected)} />
      <Handle type="target" position={Position.Left} id="in" className={handleClass(selected)} />
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
```

---

### Task 6: Create TopologyPanel component

**Files:**
- Create: `frontend/src/views/components/TopologyPanel.tsx`

- [ ] **Step 1: Create the interactive React Flow canvas with toolbar**

```typescript
import { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
  addEdge,
  Connection,
  Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useStore } from '../../models/store';
import { PLCNode, HMINode, IONode, VFDNode } from './CustomNodes';
import { api } from '../../services/api';

const nodeTypes = { plc: PLCNode, hmi: HMINode, io: IONode, vfd: VFDNode };

export function TopologyPanel() {
  const topology = useStore((s) => s.topology);
  const setStoreTopology = useStore((s) => s.setTopology);
  const setSCLCode = useStore((s) => s.setSCLCode);
  const project = useStore((s) => s.project);
  const [isSyncing, setIsSyncing] = useState(false);

  const initialNodes = topology.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: { x: node.x, y: node.y },
    data: { label: node.label, status: node.status },
  }));

  const initialEdges = topology.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.protocol,
    type: 'smoothstep' as const,
    animated: edge.protocol === 'ETHERCAT',
    style: { stroke: '#737373', strokeWidth: 2 },
    labelStyle: { fill: '#a3a3a3', fontWeight: 700, fontSize: 12 },
    labelBgStyle: { fill: '#171717', fillOpacity: 0.8 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#737373', width: 15, height: 15 },
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync from store when AI updates topology
  useEffect(() => {
    if (topology.source !== 'ai') return;
    setNodes(
      topology.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: { x: node.x, y: node.y },
        data: { label: node.label, status: node.status },
      }))
    );
    setEdges(
      topology.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.protocol,
        type: 'smoothstep' as const,
        animated: edge.protocol === 'ETHERCAT',
        style: { stroke: '#737373', strokeWidth: 2 },
        labelStyle: { fill: '#a3a3a3', fontWeight: 700, fontSize: 12 },
        labelBgStyle: { fill: '#171717', fillOpacity: 0.8 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#737373' },
      }))
    );
  }, [topology, setNodes, setEdges]);

  // Refs to escape stale closures
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  const mapToStoreFormat = useCallback(() => {
    return {
      nodes: nodesRef.current.map((n) => ({
        id: n.id,
        type: n.type || 'unknown',
        label: n.data.label,
        x: n.position.x,
        y: n.position.y,
      })),
      edges: edgesRef.current.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        protocol: (e.label as string) || 'PROFINET',
      })),
    };
  }, []);

  const handleSyncToCode = useCallback(async () => {
    if (isSyncing || !project) return;
    setIsSyncing(true);
    const mapped = mapToStoreFormat();
    setStoreTopology(mapped.nodes, mapped.edges);
    try {
      const data = await api.updateCodeFromTopology(project.id, { nodes: mapped.nodes, edges: mapped.edges });
      if (data.sclCode) setSCLCode(data.sclCode);
    } catch (err) {
      console.error('Failed to sync code', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, project, mapToStoreFormat, setStoreTopology, setSCLCode]);

  const addNode = (type: string) => {
    const newNode = {
      id: `${type}_${Date.now()}`,
      type,
      position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      data: { label: `New ${type.toUpperCase()}`, status: 'ok' as const },
    };
    setNodes((nds) => nds.concat(newNode));
    setTimeout(handleSyncToCode, 500);
  };

  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      setTimeout(() => {
        const mapped = mapToStoreFormat();
        setStoreTopology(mapped.nodes, mapped.edges, 'user');
      }, 50);
      if (changes.some((c: any) => c.type === 'remove' || c.type === 'add')) {
        setTimeout(handleSyncToCode, 500);
      }
    },
    [onNodesChange, handleSyncToCode, mapToStoreFormat, setStoreTopology]
  );

  const handleEdgesChange = useCallback(
    (changes: any) => {
      onEdgesChange(changes);
      setTimeout(() => {
        const mapped = mapToStoreFormat();
        setStoreTopology(mapped.nodes, mapped.edges, 'user');
      }, 50);
      if (changes.some((c: any) => c.type === 'remove' || c.type === 'add')) {
        setTimeout(handleSyncToCode, 500);
      }
    },
    [onEdgesChange, handleSyncToCode, mapToStoreFormat, setStoreTopology]
  );

  const onConnect = useCallback(
    (params: Edge | Connection) => {
      const newEdge = {
        ...params,
        id: `e_${params.source}_${params.target}_${Date.now()}`,
        type: 'smoothstep' as const,
        label: 'PROFINET',
        animated: false,
        style: { stroke: '#737373', strokeWidth: 2 },
        labelStyle: { fill: '#a3a3a3', fontWeight: 700, fontSize: 12 },
        labelBgStyle: { fill: '#171717', fillOpacity: 0.8 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#737373' },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      setTimeout(handleSyncToCode, 500);
    },
    [setEdges, handleSyncToCode]
  );

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col p-8 rounded-[2.5rem]">
      <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-indigo-600/20 rounded-full blur-[100px]" />

      <div className="flex justify-between items-center relative z-10 shrink-0 mb-4">
        <div className="flex items-center gap-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
              Active Topology
            </span>
          </div>
          <div className="flex bg-neutral-800 rounded-xl p-1 gap-1">
            {['plc', 'hmi', 'io', 'vfd'].map((type) => (
              <button
                key={type}
                onClick={() => addNode(type)}
                className="px-3 py-1.5 text-xs font-bold text-neutral-300 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors"
              >
                + {type.toUpperCase()}
              </button>
            ))}
            <div className="w-px bg-neutral-700 my-1 mx-1" />
            <button
              onClick={() => {
                const nodeRemovals = nodes.filter((n) => n.selected).map((n) => ({ type: 'remove' as const, id: n.id }));
                const edgeRemovals = edges.filter((e) => e.selected).map((e) => ({ type: 'remove' as const, id: e.id }));
                if (nodeRemovals.length > 0) handleNodesChange(nodeRemovals);
                if (edgeRemovals.length > 0) handleEdgesChange(edgeRemovals);
              }}
              disabled={!nodes.some((n) => n.selected) && !edges.some((e) => e.selected)}
              className="px-3 py-1.5 text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-colors"
            >
              Delete Selected
            </button>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSyncToCode}
            disabled={isSyncing || !project}
            className="px-6 py-2.5 bg-indigo-600 border border-indigo-500 rounded-2xl text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-500/20"
          >
            {isSyncing ? 'Syncing...' : 'Sync to SCL Code'}
          </button>
          <button className="px-6 py-2.5 bg-neutral-800 border border-neutral-700 rounded-2xl text-sm font-bold hover:bg-neutral-700 transition-colors">
            Export SVG
          </button>
        </div>
      </div>

      <div className="flex-1 relative z-10 p-0 rounded-3xl overflow-hidden border border-neutral-800/50 bg-[#111111]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          attributionPosition="bottom-right"
          className="react-flow-dark"
        >
          <Background color="#525252" variant={BackgroundVariant.Dots} gap={24} size={2} />
          <Controls className="bg-neutral-800 border-neutral-700 fill-neutral-400 text-neutral-400" />
        </ReactFlow>
      </div>
    </div>
  );
}
```

---

### Task 7: Create ChatPanel component (zip-style)

**Files:**
- Create: `frontend/src/views/components/ChatPanel.tsx`

- [ ] **Step 1: Create chat panel with SSE streaming and zip visual style**

```typescript
import { useState, useRef, useEffect } from 'react';
import { useStore, type ChatMessage } from '../../models/store';
import { api } from '../../services/api';

export function ChatPanel() {
  const store = useStore();
  const { messages, stage, project } = store;
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    store.addMessage({ id: '', role: 'user', content: userMessage, timestamp: 0 });
    setIsProcessing(true);

    // Ensure project exists
    let p = project;
    if (!p) {
      try {
        p = await api.createProject('New Project');
        store.setProject(p);
      } catch {
        p = { id: '1', name: 'New Project' };
        store.setProject(p);
      }
    }

    const botMsgId = String(Date.now());
    store.addMessage({
      id: botMsgId,
      role: 'assistant',
      content: 'Initializing LangGraph state machine...',
      timestamp: 0,
    });

    try {
      const response = await api.analyzeV2SSE(p.id, userMessage);
      if (!response.body) throw new Error('No body in response');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((line) => line.startsWith('data: '));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.replace('data: ', ''));
            if (data.done) {
              setIsProcessing(false);
              fullText += '\n\nTask completed successfully.';
              // Update last bot message
              const msgs = useStore.getState().messages;
              const lastIdx = msgs.length - 1;
              if (lastIdx >= 0) {
                msgs[lastIdx] = { ...msgs[lastIdx], content: fullText };
                useStore.setState({ messages: [...msgs] });
              }

              if (data.payload) {
                if (data.payload.topology) {
                  useStore.getState().setTopology(
                    data.payload.topology.nodes,
                    data.payload.topology.edges,
                    'ai'
                  );
                }
                if (data.payload.bom) useStore.getState().setBOM(data.payload.bom);
                if (data.payload.sclCode) useStore.getState().setSCLCode(data.payload.sclCode);
              }
              break;
            } else if (data.step) {
              fullText += (fullText ? '\n' : '') + data.step;
              const msgs = useStore.getState().messages;
              const lastIdx = msgs.length - 1;
              if (lastIdx >= 0) {
                msgs[lastIdx] = { ...msgs[lastIdx], content: fullText };
                useStore.setState({ messages: [...msgs] });
              }
            }
          } catch {
            // skip unparseable lines
          }
        }
      }
    } catch (error: any) {
      setIsProcessing(false);
      store.addMessage({
        id: '',
        role: 'system',
        content: `Error: ${error.message}`,
        timestamp: 0,
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden min-h-0">
      <div className="flex justify-between items-center mb-6 text-xs text-neutral-500 font-bold uppercase tracking-[0.2em] shrink-0">
        <span>LangGraph Agent</span>
        <div className="flex gap-3">
          <button className="hover:text-neutral-300">&rarr;</button>
          <button
            className="hover:text-neutral-300"
            onClick={() => useStore.setState({ messages: [] })}
          >
            &times;
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
        {messages.length === 0 && (
          <div className="text-center text-neutral-500 text-sm mt-8 px-4">
            Describe your electrical control requirements to get started.
            <br /><br />
            <span className="text-neutral-600">
              Example: "Design a conveyor system with 3 motors, E-Stop, and interlock logic"
            </span>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
          >
            {msg.role !== 'user' && (
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 mt-1 ${
                  isProcessing && msg.role === 'assistant'
                    ? 'bg-indigo-500 text-white animate-pulse shadow-[0_0_15px_rgba(99,102,241,0.5)]'
                    : 'bg-indigo-500/20 text-indigo-400'
                }`}
              >
                EE
              </div>
            )}
            <div
              className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-sm font-medium ml-8'
                  : 'bg-neutral-800 text-neutral-300 rounded-tl-sm font-mono text-xs mr-8 shadow-inner border border-neutral-700/50'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="mt-6 relative shrink-0">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={isProcessing ? 'Processing via LangGraph...' : 'Type a message...'}
          disabled={isProcessing}
          className="w-full bg-neutral-800 border border-neutral-700 rounded-2xl py-4 pl-4 pr-20 text-sm text-white focus:outline-none focus:border-indigo-500 font-medium placeholder:text-neutral-500 transition-colors disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={isProcessing || !inputValue.trim()}
          className="absolute right-2 top-2 bottom-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-bold text-xs px-5 rounded-xl transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

---

### Task 8: Create Header component

**Files:**
- Create: `frontend/src/views/components/Header.tsx`

- [ ] **Step 1: Create header with logo, tab nav, theme toggle, settings**

```typescript
import { Settings, Sun, Moon } from 'lucide-react';
import { useStore } from '../../models/store';

export function Header({
  activeTab,
  setActiveTab,
  onOpenSettings,
}: {
  activeTab: string;
  setActiveTab: (t: string) => void;
  onOpenSettings: () => void;
}) {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  return (
    <header className="h-[72px] flex items-center justify-between px-8 bg-neutral-900 border border-neutral-800 rounded-[2.5rem] shrink-0 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <span className="text-white font-bold tracking-tighter">EE</span>
        </div>
        <span className="text-xl font-bold tracking-tight uppercase">EE Assistant</span>
      </div>

      <nav className="flex bg-neutral-950 border border-neutral-800 rounded-full px-2 py-1.5 gap-2 text-sm font-bold text-neutral-500 h-[52px]">
        {[
          ['topology', 'Topology'],
          ['bom', 'BOM'],
          ['code', 'SCL Code'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-6 h-full flex items-center rounded-full transition-all tracking-wide ${
              activeTab === id
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'hover:text-white hover:bg-neutral-800/50'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-4">
        <div className="px-4 py-2 bg-neutral-800/50 rounded-full text-xs font-bold text-indigo-400 border border-indigo-500/20 uppercase tracking-widest hidden lg:block">
          v2.0.0
        </div>
        <button
          onClick={toggleTheme}
          className="w-10 h-10 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
        <button
          onClick={onOpenSettings}
          className="w-10 h-10 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
```

---

### Task 9: Create BOMPanel component

**Files:**
- Create: `frontend/src/views/components/BOMPanel.tsx`

- [ ] **Step 1: Create BOM table with zip visual style**

```typescript
import { Download, Search, Filter } from 'lucide-react';
import { useStore } from '../../models/store';

export function BOMPanel() {
  const bomData = useStore((s) => s.bom);

  return (
    <div className="w-full h-full flex flex-col p-8 overflow-hidden rounded-[2.5rem] relative">
      <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px]" />

      <div className="flex justify-between items-start mb-8 relative z-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full mb-3">
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
              Bill of Materials
            </span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white">BOM</h2>
        </div>
        <div className="flex gap-3 mt-4">
          <button className="flex items-center gap-2 px-6 py-3 bg-white text-black text-sm font-bold rounded-2xl shadow-sm hover:scale-105 active:scale-95 transition-all">
            <Download className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-3 mb-6 relative z-10">
        <button className="flex items-center gap-2 px-6 py-2.5 bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm font-bold rounded-2xl hover:bg-neutral-700 transition-colors">
          Filters <Filter className="w-4 h-4" />
        </button>
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search parts..."
            className="pl-12 pr-4 py-2.5 bg-neutral-800 border border-neutral-700 text-white text-sm font-medium rounded-2xl focus:outline-none focus:border-indigo-500 w-72"
          />
        </div>
      </div>

      <div className="flex-1 bg-neutral-950 border border-neutral-800 rounded-[2rem] overflow-hidden flex flex-col relative z-10 shadow-inner">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-left text-sm text-neutral-300 whitespace-nowrap">
            <thead className="bg-neutral-900 text-neutral-400 sticky top-0 z-10 border-b border-neutral-800">
              <tr>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-indigo-400">Item No.</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Component Name</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Manufacturer</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Part Number</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Qty</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Specifications</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {bomData.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-neutral-800/50 transition-colors ${item.active ? 'bg-neutral-900' : ''}`}
                >
                  <td className="px-6 py-4 text-indigo-400 font-bold">{item.id}</td>
                  <td className="px-6 py-4 font-medium">{item.name}</td>
                  <td className="px-6 py-4 text-neutral-400">{item.mfg}</td>
                  <td className="px-6 py-4 font-mono text-emerald-400">
                    <span className="bg-emerald-500/10 inline-block mt-2 px-2.5 py-0.5 rounded-md text-xs font-bold">
                      {item.pn}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-md bg-indigo-500/20 text-indigo-400 font-bold">
                      {item.qty}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-neutral-400">{item.specs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

---

### Task 10: Create SCLPanel component (Monaco-based)

**Files:**
- Create: `frontend/src/views/components/SCLPanel.tsx`

- [ ] **Step 1: Create SCL code viewer using Monaco Editor with zip styling**

```typescript
import { Download } from 'lucide-react';
import { useStore } from '../../models/store';
import Editor from '@monaco-editor/react';

export function SCLPanel() {
  const code = useStore((s) => s.sclCode);

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col p-8 rounded-[2.5rem]">
      <div className="absolute -right-20 -top-20 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px]" />

      <div className="flex justify-between items-center mb-8 relative z-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full mb-3">
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
              Compiler Target: S7-1500
            </span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white">PLC Code (SCL)</h2>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-white text-black text-sm font-bold rounded-2xl shadow-sm hover:scale-105 active:scale-95 transition-all mt-4">
          <Download className="w-4 h-4" />
          Download Code
        </button>
      </div>

      <div className="flex-1 bg-neutral-950 border border-neutral-800 rounded-[2rem] overflow-hidden shadow-inner relative z-10">
        <Editor
          height="100%"
          defaultLanguage="pascal"
          value={code}
          theme="vs-dark"
          options={{
            readOnly: false,
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
          }}
          loading={
            <div className="flex items-center justify-center h-full text-neutral-500">
              Loading editor...
            </div>
          }
        />
      </div>
    </div>
  );
}
```

---

### Task 11: Create SettingsModal component

**Files:**
- Create: `frontend/src/views/components/SettingsModal.tsx`

- [ ] **Step 1: Create settings modal with model selectors**

```typescript
import { useState } from 'react';
import { X, Cpu, Database } from 'lucide-react';

type Props = { isOpen: boolean; onClose: () => void };

export function SettingsModal({ isOpen, onClose }: Props) {
  const [chatModel, setChatModel] = useState('claude-opus-4-7');
  const [embeddingModel, setEmbeddingModel] = useState('text-embedding-3-small');

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-neutral-800">
          <h2 className="text-xl font-bold text-white tracking-tight">System Settings</h2>
          <button
            onClick={onClose}
            className="p-2 text-neutral-500 hover:text-white bg-neutral-800 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold text-neutral-300 uppercase tracking-wider">
              <Cpu className="w-4 h-4 text-indigo-400" />
              Chat LLM Model
            </label>
            <div className="relative">
              <select
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 text-white text-sm font-medium rounded-xl px-4 py-3 appearance-none focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
              >
                <option value="claude-opus-4-7">Claude Opus 4.7 (Default)</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-neutral-500">
                &#9660;
              </div>
            </div>
            <p className="text-xs text-neutral-500 font-medium">
              Used for requirements breakdown and component selection logic.
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold text-neutral-300 uppercase tracking-wider">
              <Database className="w-4 h-4 text-emerald-400" />
              Embedding Model
            </label>
            <div className="relative">
              <select
                value={embeddingModel}
                onChange={(e) => setEmbeddingModel(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 text-white text-sm font-medium rounded-xl px-4 py-3 appearance-none focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
              >
                <option value="text-embedding-3-small">text-embedding-3-small (Default)</option>
                <option value="text-embedding-004">text-embedding-004</option>
                <option value="voyage-large-2">Voyage Large 2</option>
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-neutral-500">
                &#9660;
              </div>
            </div>
            <p className="text-xs text-neutral-500 font-medium">
              Used for vectorizing equipment specs and manual searches.
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-neutral-800 bg-neutral-950/50">
          <button
            onClick={onClose}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### Task 12: Rewrite AppLayout with three-column layout

**Files:**
- Modify: `frontend/src/views/components/AppLayout.tsx`

- [ ] **Step 1: Replace with zip-style three-column layout**

```typescript
import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../models/store';
import { Header } from './Header';
import { ChatPanel } from './ChatPanel';
import { TopologyPanel } from './TopologyPanel';
import { BOMPanel } from './BOMPanel';
import { SCLPanel } from './SCLPanel';
import { SettingsModal } from './SettingsModal';
import { KnowledgePanel } from './KnowledgePanel';

export function AppLayout() {
  const activeCanvasTab = useStore((s) => s.activeCanvasTab);
  const setActiveCanvasTab = useStore((s) => s.setActiveCanvasTab);

  const [leftTab, setLeftTab] = useState<'chat' | 'knowledge'>('chat');
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = e.clientX - 16;
      if (newWidth > 250 && newWidth < 800) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = 'default';
        document.body.classList.remove('select-none');
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-50 font-sans p-4 gap-4 overflow-hidden relative">
      {/* Left Panel: Chat / Knowledge */}
      <div style={{ width: sidebarWidth }} className="flex-shrink-0 flex flex-col">
        <div className="w-full flex flex-col bg-neutral-900 border border-neutral-800 rounded-[2.5rem] shrink-0 h-full overflow-hidden shadow-xl">
          <div className="flex border-b border-neutral-800 px-6 pt-6 gap-2 shrink-0">
            <button
              className={`pb-4 px-2 text-sm font-bold uppercase tracking-wide flex-1 border-b-[3px] transition-colors ${
                leftTab === 'chat'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
              onClick={() => setLeftTab('chat')}
            >
              Chat
            </button>
            <button
              className={`pb-4 px-2 text-sm font-bold uppercase tracking-wide flex-1 border-b-[3px] transition-colors ${
                leftTab === 'knowledge'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
              onClick={() => setLeftTab('knowledge')}
            >
              Knowledge Base
            </button>
          </div>
          {leftTab === 'chat' ? <ChatPanel /> : <KnowledgePanel />}
        </div>
      </div>

      {/* Resizer */}
      <div
        className="w-3 relative mx-[-8px] z-10 flex items-center justify-center cursor-col-resize group"
        onMouseDown={(e) => {
          e.preventDefault();
          isDragging.current = true;
          document.body.style.cursor = 'col-resize';
          document.body.classList.add('select-none');
        }}
      >
        <div className="w-1 h-12 bg-neutral-700/50 rounded-full group-hover:bg-indigo-500 group-active:bg-indigo-400 transition-colors shadow-sm" />
      </div>

      {/* Right Panel: Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          activeTab={activeCanvasTab}
          setActiveTab={(t) => setActiveCanvasTab(t as 'topology' | 'bom' | 'code')}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
        <main className="flex-1 mt-4 overflow-hidden relative border border-neutral-800 rounded-[2.5rem] bg-neutral-900 shadow-xl">
          {activeCanvasTab === 'topology' && <TopologyPanel />}
          {activeCanvasTab === 'bom' && <BOMPanel />}
          {activeCanvasTab === 'code' && <SCLPanel />}
        </main>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
```

---

### Task 13: Update App.tsx, index.html, and KnowledgePanel

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/index.html`
- Modify: `frontend/src/views/components/KnowledgePanel.tsx`

- [ ] **Step 1: Set initial theme attribute in index.html**

Replace `frontend/index.html` with:

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EE Assistant</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Simplify App.tsx**

```typescript
import { AppLayout } from './views/components/AppLayout';

export default function App() {
  return <AppLayout />;
}
```

- [ ] **Step 3: Simplify KnowledgePanel to match zip style**

Replace `frontend/src/views/components/KnowledgePanel.tsx` with:

```typescript
export function KnowledgePanel() {
  return (
    <div className="flex-1 flex flex-col p-0 overflow-hidden min-h-0">
      <div className="p-6 pb-2 border-b border-neutral-800 shrink-0">
        <h3 className="text-sm font-bold text-neutral-300 mb-4 tracking-wide">Document Library</h3>
        <div className="relative">
          <input
            type="text"
            placeholder="Search specs, docs..."
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder:text-neutral-600 transition-colors"
          />
          <svg
            className="absolute left-3 top-3 w-4 h-4 text-neutral-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 pr-2 custom-scrollbar">
        {[
          { title: 'Siemens S7-1500 Manual', type: 'PDF', tags: ['PLC', 'Siemens'] },
          { title: 'SINAMICS G120C Comm', type: 'DOCX', tags: ['VFD', 'Profinet'] },
          { title: 'IEC 61131-3 Standard', type: 'PDF', tags: ['Standard'] },
          { title: 'Pilz PNOZ X2.7P Specs', type: 'PDF', tags: ['Safety'] },
          { title: 'ET200SP Hardware config', type: 'PDF', tags: ['Remote IO'] },
        ].map((doc, i) => (
          <div
            key={i}
            className="group bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-800 rounded-2xl p-4 transition-colors cursor-pointer relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/5 rounded-bl-full group-hover:bg-indigo-500/10 transition-colors" />
            <div className="flex items-start gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  doc.type === 'PDF' ? 'bg-rose-500/20 text-rose-400' : 'bg-blue-500/20 text-blue-400'
                }`}
              >
                <span className="text-[10px] font-bold">{doc.type}</span>
              </div>
              <div>
                <h4 className="text-sm font-medium text-neutral-200 group-hover:text-indigo-400 transition-colors">
                  {doc.title}
                </h4>
                <div className="flex gap-2 mt-2">
                  {doc.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-neutral-700/50 text-neutral-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-6 border-t border-neutral-800 shrink-0">
        <button className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-neutral-600 rounded-xl text-sm font-bold text-neutral-300 transition-all border-dashed flex justify-center items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Upload Document
        </button>
      </div>
    </div>
  );
}
```

---

### Task 14: Remove obsolete components

**Files to delete:**
- `frontend/src/views/components/CanvasPanel.tsx`
- `frontend/src/views/components/FrameworkDiagram.tsx`
- `frontend/src/views/components/ChatInput.tsx`
- `frontend/src/views/components/ChatMessage.tsx`
- `frontend/src/views/components/ExportToolbar.tsx`
- `frontend/src/views/components/FileDropZone.tsx`
- `frontend/src/views/components/ProgressStepper.tsx`
- `frontend/src/views/components/BOMTable.tsx`
- `frontend/src/views/components/STCodeView.tsx`
- `frontend/src/models/project.ts`
- `frontend/src/models/selection.ts`
- `frontend/src/models/schematic.ts`
- `frontend/src/models/codegen.ts`
- `frontend/src/services/analysis.ts`
- `frontend/src/services/websocket.ts`
- `frontend/src/services/export.ts`

- [ ] **Step 1: Delete all obsolete files**

```bash
rm frontend/src/views/components/CanvasPanel.tsx
rm frontend/src/views/components/FrameworkDiagram.tsx
rm frontend/src/views/components/ChatInput.tsx
rm frontend/src/views/components/ChatMessage.tsx
rm frontend/src/views/components/ExportToolbar.tsx
rm frontend/src/views/components/FileDropZone.tsx
rm frontend/src/views/components/ProgressStepper.tsx
rm frontend/src/views/components/BOMTable.tsx
rm frontend/src/views/components/STCodeView.tsx
rm frontend/src/models/project.ts
rm frontend/src/models/selection.ts
rm frontend/src/models/schematic.ts
rm frontend/src/models/codegen.ts
rm frontend/src/services/analysis.ts
rm frontend/src/services/websocket.ts
rm frontend/src/services/export.ts
```

---

### Task 15: Build and verify

**Files:**
- Verify all new files exist and compile cleanly

- [ ] **Step 1: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Build**

```bash
cd frontend && npx vite build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Run dev server and verify**

```bash
cd frontend && npm run dev
```

Expected: App loads at `http://localhost:5173` with:
- Left sidebar with Chat / Knowledge tabs
- Dark industrial theme
- Right canvas with Topology / BOM / SCL Code tabs
- Interactive React Flow canvas with custom PLC/HMI/IO/VFD nodes
- Chat input with send button
- Theme toggle in header

- [ ] **Step 4: Commit all changes**

```bash
git add -A
git commit -m "feat: replace Mermaid with React Flow interactive topology canvas, adopt industrial dark UI

- Install reactflow, lucide-react, motion
- Expand CSS variables with industrial dark theme + React Flow overrides
- Rewrite Zustand store with topology/bom/sclCode + theme/stage/messages
- Create CustomNodes (PLC/HMI/IO/VFD) with smart handles
- Create TopologyPanel with React Flow canvas, add/delete nodes, sync to code
- Create ChatPanel with SSE streaming from /analyze-v2
- Create Header with tab navigation, theme toggle, settings
- Create BOMPanel with searchable parts table
- Create SCLPanel with Monaco Editor
- Create SettingsModal with model selector
- Rewrite AppLayout as three-column with draggable resizer
- Remove obsolete Mermaid-based components and services
- Update KnowledgePanel with zip visual style"
```
