# React Flow Frontend Redesign

## Summary
Replace the current Mermaid-based static schematic view with an interactive React Flow topology canvas, adopting the industrial dark-first UI from the zip prototype while preserving the current project's CSS variable theming system, MVS architecture, and backend API integration.

## Motivation
- Mermaid renders static diagrams — engineers need an **interactive canvas** to drag nodes, create connections, and edit topology directly
- The zip prototype proved React Flow + custom industrial nodes + AI chat is a validated UX pattern
- The current backend (LangGraph multi-agent, dual-path retrieval, rule engine) is the real moat — the frontend should match its capability

## Scope

### In scope
1. Install `reactflow`, `lucide-react`, `motion` dependencies
2. Expand CSS variable system with industrial dark theme tokens + React Flow overrides
3. Rewrite Zustand store to include `topology` (nodes/edges), `bom`, `sclCode` alongside existing `theme`/`stage`/`messages`
4. Create new components: `TopologyPanel` (React Flow canvas), `CustomNodes` (PLC/HMI/IO/VFD), `Header`, `ChatPanel` (with SSE streaming), `BOMPanel`, `SCLPanel`, `SettingsModal`
5. Rewrite `AppLayout` with three-column layout (chat | resizer | canvas+tabs)
6. Extend `api.ts` with `/analyze-v2` SSE streaming endpoint
7. Preserve: `ThemeToggle`, CSS variable pattern, MVS folder structure, backend API contracts

### Out of scope
- Backend changes (the existing `/analyze-v2` SSE endpoint stays as-is)
- Database schema changes
- Knowledge graph modifications
- Undo/redo, auto-layout (dagre), edge property editing (future milestones)

## Architecture

### Component Tree
```
App → AppLayout
  ├── Left Panel (resizable, 20-50%)
  │   ├── Tab Bar: [Chat | Knowledge]
  │   ├── ChatPanel (messages + input + SSE streaming)
  │   └── KnowledgePanel (existing, preserved)
  ├── Resizer (1px drag handle)
  └── Right Panel
      ├── Header (logo, tab nav: Topology|BOM|SCL Code, settings gear)
      ├── TopologyPanel (React Flow canvas + toolbar)
      ├── BOMPanel (table with confidence badges)
      ├── SCLPanel (Monaco Editor with syntax highlighting)
      └── SettingsModal (model selector)
```

### Data Flow
```
User Input → ChatPanel → POST /analyze-v2 (SSE) → stream steps to chat
                                                    → on done: payload.topology → store.setTopology()
                                                               payload.bom → store.setBOM()
                                                               payload.sclCode → store.setSCLCode()
                                                    → TopologyPanel syncs from store (source='ai')
User drags/connects nodes → TopologyPanel local state → debounced sync to store (source='user')
"Sync to SCL Code" button → POST /codegen → store.setSCLCode()
```

### State Shape (Zustand)
```ts
interface AppState {
  // From zip
  topology: { nodes: NodeData[], edges: EdgeData[], source: 'ai' | 'user' }
  bom: BOMItem[]
  sclCode: string
  
  // From current project
  project: Project | null
  stage: AnalysisStage
  messages: ChatMessage[]
  activeCanvasTab: 'topology' | 'bom' | 'code'
  theme: 'light' | 'dark'
  
  // Actions
  setTopology, setBOM, setSCLCode,
  setProject, setStage, addMessage, updateProgress,
  setActiveCanvasTab, toggleTheme
}
```

## Key Design Decisions

1. **CSS variable theming preserved** — dark theme uses zip's neutral palette (`neutral-950`/`neutral-900`/`neutral-800`) with indigo accent, light theme stays as-is
2. **React Flow replaces Mermaid** — `FrameworkDiagram.tsx` removed, `TopologyPanel.tsx` becomes the primary canvas
3. **SSE streaming** — `/analyze-v2` response format: `{ step, done, payload }` matching zip's server.ts pattern
4. **Monaco Editor kept** for SCL code (zip uses plain `<pre>`, but Monaco is strictly better for code editing)
5. **`motion`** (from zip's deps) used for animations instead of raw CSS transitions
