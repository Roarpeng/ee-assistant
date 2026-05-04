# Canvas-Chat Interaction Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add right-click contextual chat, new-conversation flow, history persistence, node preview, and unread badge — all frontend-only.

**Architecture:** Extend the existing Zustand store with new state fields and actions. Three new hook/component files for modularity. Modify TopologyPanel (event handlers), ChatPanel (buttons + context tag + history), AppLayout (badge). All state flows through Zustand; persistence through localStorage.

**Tech Stack:** React 18 · TypeScript · Zustand · ReactFlow · Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/models/store.ts` | Modify | Add state fields + actions |
| `frontend/src/hooks/useChatHistory.ts` | Create | localStorage read/write/trim |
| `frontend/src/views/components/CanvasContextMenu.tsx` | Create | Right-click popup menu |
| `frontend/src/views/components/NodeInfoCard.tsx` | Create | Node info preview card |
| `frontend/src/views/components/TopologyPanel.tsx` | Modify | onNodeContextMenu, onNodeClick, onPaneClick |
| `frontend/src/views/components/ChatPanel.tsx` | Modify | Header buttons, context tag, history load |
| `frontend/src/views/components/AppLayout.tsx` | Modify | Unread badge on Chat tab |
| `frontend/src/services/i18n.ts` | Modify | New translation strings |

---

### Task 1: Extend Zustand Store

**File:** `frontend/src/models/store.ts`

- [ ] **Step 1: Add `ChatContext` type and `ChatMessage.context` field**

After `ChatMessage` interface (line 66), add:

```typescript
export interface ChatContext {
  nodeIds: string[];
  mode: 'single' | 'selection';
}
```

Add `context` to `ChatMessage`:

```typescript
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  context?: ChatContext;
}
```

- [ ] **Step 2: Add new state fields to `AppState` interface**

After `knowledgeLoading: boolean;` (line 112), add:

```typescript
  chatContext: ChatContext | null;
  previewNodeId: string | null;
  unreadChatCount: number;
```

- [ ] **Step 3: Add new action signatures to `AppState` interface**

After `setKnowledgeLoading: ...` (line 129), add:

```typescript
  setChatContext: (ctx: ChatContext | null) => void;
  setPreviewNodeId: (id: string | null) => void;
  newProject: () => Promise<void>;
  clearChat: () => void;
  resetCanvasWorkspace: () => void;
  incrementUnread: () => void;
  resetUnread: () => void;
  saveChatHistory: () => void;
  loadChatHistory: () => void;
```

- [ ] **Step 4: Add default values to `create()` initial state**

After `knowledgeLoading: false,` (line 152), add:

```typescript
  chatContext: null,
  previewNodeId: null,
  unreadChatCount: 0,
```

- [ ] **Step 5: Add action implementations to `create()` object**

After `setKnowledgeLoading: (knowledgeLoading) => set({ knowledgeLoading }),` (line 200), add:

```typescript
  setChatContext: (chatContext) => set({ chatContext }),
  setPreviewNodeId: (previewNodeId) => set({ previewNodeId }),

  resetCanvasWorkspace: () =>
    set({
      topology: { nodes: [], edges: [] },
      bom: [],
      sclCode: '',
      messages: [],
      chatContext: null,
      previewNodeId: null,
      stage: 'idle',
    }),

  clearChat: () => {
    const s = useStore.getState();
    if (s.project) {
      const key = 'volta-chat-history';
      try {
        const raw = localStorage.getItem(key);
        const all: Record<string, ChatMessage[]> = raw ? JSON.parse(raw) : {};
        all[s.project.id] = s.messages;
        localStorage.setItem(key, JSON.stringify(all));
      } catch {}
    }
    set({ messages: [], chatContext: null });
  },

  newProject: async () => {
    const s = useStore.getState();
    // Save current history
    if (s.project) {
      const key = 'volta-chat-history';
      try {
        const raw = localStorage.getItem(key);
        const all: Record<string, ChatMessage[]> = raw ? JSON.parse(raw) : {};
        all[s.project.id] = s.messages;
        localStorage.setItem(key, JSON.stringify(all));
      } catch {}
    }
    // Create new project via API
    try {
      const { api } = await import('../services/api');
      const p = await api.createProject('New Project');
      set({
        project: p,
        topology: { nodes: [], edges: [] },
        bom: [],
        sclCode: '',
        messages: [],
        chatContext: null,
        previewNodeId: null,
        stage: 'idle',
        unreadChatCount: 0,
      });
    } catch {
      const fallbackId = 'proj_' + Date.now();
      set({
        project: { id: fallbackId, name: 'New Project' },
        topology: { nodes: [], edges: [] },
        bom: [],
        sclCode: '',
        messages: [],
        chatContext: null,
        previewNodeId: null,
        stage: 'idle',
        unreadChatCount: 0,
      });
    }
  },

  incrementUnread: () => set((s) => ({ unreadChatCount: s.unreadChatCount + 1 })),

  resetUnread: () => set({ unreadChatCount: 0 }),

  saveChatHistory: () => {
    const s = useStore.getState();
    if (!s.project) return;
    const key = 'volta-chat-history';
    try {
      const raw = localStorage.getItem(key);
      const all: Record<string, ChatMessage[]> = raw ? JSON.parse(raw) : {};
      all[s.project.id] = s.messages.slice(-100); // trim to 100
      localStorage.setItem(key, JSON.stringify(all));
    } catch {}
  },

  loadChatHistory: () => {
    const s = useStore.getState();
    if (!s.project) return;
    const key = 'volta-chat-history';
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const all: Record<string, ChatMessage[]> = JSON.parse(raw);
      const msgs = all[s.project.id];
      if (msgs && msgs.length > 0) {
        set({ messages: msgs });
        // Restore msgCounter to avoid ID collisions
        const maxId = msgs.reduce((max, m) => Math.max(max, parseInt(m.id) || 0), 0);
        msgCounter = maxId;
      }
    } catch {}
  },
```

Note: `msgCounter` is accessed from the closure. It's a module-level `let` variable (line 132). We need to update it after loading history. Add `msgCounter = maxId;` inside the `loadChatHistory` implementation.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/models/store.ts
git commit -m "feat: extend store with chatContext, history, preview, unread"
```

---

### Task 2: Create useChatHistory Hook

**File:** Create `frontend/src/hooks/useChatHistory.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useEffect, useCallback } from 'react';
import { useStore } from '../models/store';

const HISTORY_KEY = 'volta-chat-history';

export function useChatHistory() {
  const project = useStore((s) => s.project);
  const messages = useStore((s) => s.messages);
  const loadChatHistory = useStore((s) => s.loadChatHistory);
  const saveChatHistory = useStore((s) => s.saveChatHistory);

  // Load history when project changes
  useEffect(() => {
    if (project) {
      loadChatHistory();
    }
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save on message changes (debounced)
  useEffect(() => {
    if (!project || messages.length === 0) return;
    const timer = setTimeout(() => saveChatHistory(), 1000);
    return () => clearTimeout(timer);
  }, [messages.length, project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearAllHistory = useCallback(() => {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {}
  }, []);

  return { saveChatHistory, loadChatHistory, clearAllHistory };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useChatHistory.ts
git commit -m "feat: add useChatHistory hook for localStorage persistence"
```

---

### Task 3: Create CanvasContextMenu Component

**File:** Create `frontend/src/views/components/CanvasContextMenu.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useEffect, useRef } from 'react';
import { useStore } from '../../models/store';
import type { NodeData } from '../../models/store';
import { t } from '../../services/i18n';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  nodes: NodeData[];
  mode: 'single' | 'selection';
  onDismiss: () => void;
}

export function CanvasContextMenu({ x, y, nodes, mode, onDismiss }: CanvasContextMenuProps) {
  const setChatContext = useStore((s) => s.setChatContext);
  const setActiveCanvasTab = useStore((s) => s.setActiveCanvasTab);
  const language = useStore((s) => s.language);
  const tr = t(language);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onDismiss]);

  const handleDiscuss = () => {
    const nodeIds = nodes.map((n) => n.id);
    setChatContext({ nodeIds, mode });
    setActiveCanvasTab('topology'); // keep on topology, chat panel will handle
    onDismiss();
  };

  const label = mode === 'single'
    ? tr.canvas.discussSingle
    : `${tr.canvas.discussSelection} (${nodes.length})`;

  const summary = nodes.slice(0, 5).map((n) => n.data?.label || n.type).join(', ');
  if (nodes.length > 5) summary += ` +${nodes.length - 5}`;

  return (
    <div
      ref={menuRef}
      className="absolute z-50 bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl py-1.5 min-w-[220px] backdrop-blur-sm"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-2 text-[11px] text-neutral-400 border-b border-neutral-700/50 truncate max-w-[280px]">
        {summary}
      </div>
      <button
        className="w-full text-left px-3 py-2.5 text-sm text-neutral-200 hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors flex items-center gap-2"
        onClick={handleDiscuss}
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
        </svg>
        {label}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/components/CanvasContextMenu.tsx
git commit -m "feat: add CanvasContextMenu for right-click chat"
```

---

### Task 4: Create NodeInfoCard Component

**File:** Create `frontend/src/views/components/NodeInfoCard.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useStore } from '../../models/store';
import { t } from '../../services/i18n';

const STATUS_COLORS: Record<string, string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
};

export function NodeInfoCard() {
  const topology = useStore((s) => s.topology);
  const previewNodeId = useStore((s) => s.previewNodeId);
  const setPreviewNodeId = useStore((s) => s.setPreviewNodeId);
  const setChatContext = useStore((s) => s.setChatContext);
  const setActiveCanvasTab = useStore((s) => s.setActiveCanvasTab);
  const language = useStore((s) => s.language);
  const tr = t(language);

  if (!previewNodeId) return null;

  const node = topology.nodes.find((n) => n.id === previewNodeId);
  if (!node) return null;

  const nodeTypeLabel = node.type?.replace(/_/g, ' ').toUpperCase() || 'COMPONENT';
  const statusColor = STATUS_COLORS[node.status || 'ok'] || STATUS_COLORS.ok;

  const handleDetailChat = () => {
    setChatContext({ nodeIds: [node.id], mode: 'single' });
    setActiveCanvasTab('topology');
    setPreviewNodeId(null);
  };

  return (
    <div className="absolute bottom-4 right-4 z-40 w-72 bg-neutral-800/95 border border-neutral-700 rounded-2xl shadow-2xl backdrop-blur-sm p-4 animate-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColor}`} />
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{nodeTypeLabel}</span>
        </div>
        <button
          className="text-neutral-500 hover:text-neutral-300 text-xs"
          onClick={() => setPreviewNodeId(null)}
        >
          ×
        </button>
      </div>

      <h3 className="text-sm font-bold text-white mb-2">{node.label}</h3>

      {node.details && Object.keys(node.details).length > 0 && (
        <div className="space-y-1 mb-3">
          {Object.entries(node.details).slice(0, 6).map(([k, v]) => (
            <div key={k} className="flex justify-between text-[11px]">
              <span className="text-neutral-500">{k}</span>
              <span className="text-neutral-300 font-mono">{v}</span>
            </div>
          ))}
        </div>
      )}

      <div className="text-[11px] text-neutral-500 mb-3">
        ID: <code className="text-neutral-400 font-mono">{node.id}</code> · Position: ({node.x}, {node.y})
      </div>

      <button
        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors"
        onClick={handleDetailChat}
      >
        {tr.canvas.detailChat}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/components/NodeInfoCard.tsx
git commit -m "feat: add NodeInfoCard for click-to-preview"
```

---

### Task 5: Update TopologyPanel — Event Handlers

**File:** Modify `frontend/src/views/components/TopologyPanel.tsx`

- [ ] **Step 1: Add imports**

At top of file, after existing imports, add:

```typescript
import { CanvasContextMenu } from './CanvasContextMenu';
import { NodeInfoCard } from './NodeInfoCard';
import type { NodeData } from '../../models/store';
```

- [ ] **Step 2: Add context menu state to TopologyPanel**

Inside the `TopologyPanel` function, after existing `useState` declarations (line ~46), add:

```typescript
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; nodes: NodeData[]; mode: 'single' | 'selection';
  } | null>(null);

  const setPreviewNodeId = useStore((s) => s.setPreviewNodeId);
  const previewNodeId = useStore((s) => s.previewNodeId);
```

- [ ] **Step 3: Add `onNodeContextMenu` handler**

After the `onReconnect` callback (around line 211), add:

```typescript
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: any) => {
      event.preventDefault();
      const storeData = topology.nodes.find((n) => n.id === node.id);
      const nodeData: NodeData = storeData || {
        id: node.id,
        type: node.type || 'unknown',
        label: node.data?.label || node.type || '',
        x: node.position.x,
        y: node.position.y,
        status: node.data?.status,
      };
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodes: [nodeData],
        mode: 'single',
      });
    },
    [topology.nodes]
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const selected = nodes.filter((n) => n.selected);
      if (selected.length === 0) return;
      const nodeDataList: NodeData[] = selected.map((n) => {
        const storeNode = topology.nodes.find((sn) => sn.id === n.id);
        return storeNode || {
          id: n.id,
          type: n.type || 'unknown',
          label: n.data?.label || n.type || '',
          x: n.position.x,
          y: n.position.y,
        };
      });
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodes: nodeDataList,
        mode: 'selection',
      });
    },
    [nodes, topology.nodes]
  );
```

- [ ] **Step 4: Add `onNodeClick` handler**

```typescript
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: any) => {
      setPreviewNodeId(node.id);
    },
    [setPreviewNodeId]
  );

  const onPaneClick = useCallback(() => {
    setPreviewNodeId(null);
    setContextMenu(null);
  }, [setPreviewNodeId]);
```

- [ ] **Step 5: Wire handlers to ReactFlow element**

On the `<ReactFlow` element (line ~284), add these props after existing props:

```typescript
          onNodeContextMenu={onNodeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
```

- [ ] **Step 6: Render CanvasContextMenu and NodeInfoCard**

Add just before the closing `</div>` of the outermost container (before line 311):

```typescript
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodes={contextMenu.nodes}
          mode={contextMenu.mode}
          onDismiss={() => setContextMenu(null)}
        />
      )}
      <NodeInfoCard />
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/components/TopologyPanel.tsx
git commit -m "feat: add right-click context menu and click preview to TopologyPanel"
```

---

### Task 6: Update ChatPanel — Buttons, Context Tag, History

**File:** Modify `frontend/src/views/components/ChatPanel.tsx`

- [ ] **Step 1: Add imports and history hook**

Add import for `useChatHistory` after existing imports:

```typescript
import { useChatHistory } from '../../hooks/useChatHistory';
```

- [ ] **Step 2: Add hook usage and store reads**

Inside `ChatPanel` function, after existing store reads, add:

```typescript
  const { saveChatHistory } = useChatHistory();
  const chatContext = useStore((s) => s.chatContext);
  const setChatContext = useStore((s) => s.setChatContext);
  const newProject = useStore((s) => s.newProject);
  const clearChat = useStore((s) => s.clearChat);
  const topology = useStore((s) => s.topology);
  const resetUnread = useStore((s) => s.resetUnread);
```

- [ ] **Step 3: Mark read on tab focus**

Add effect after existing `useEffect` for scroll:

```typescript
  useEffect(() => {
    resetUnread();
  }, []);
```

- [ ] **Step 4: Build context prompt when chatContext changes**

Add effect to auto-compose prompt:

```typescript
  useEffect(() => {
    if (!chatContext) return;
    const ctxNodes = topology.nodes.filter((n) => chatContext.nodeIds.includes(n.id));
    if (ctxNodes.length === 0) return;
    const labels = ctxNodes.map((n) => n.label).join(', ');
    const prefix = chatContext.mode === 'single'
      ? `请帮我完善 "${ctxNodes[0].label}" 的规格参数和选型建议。`
      : `请分析以下拓扑区域内的元器件: ${labels}`;
    setInputValue(prefix);
  }, [chatContext?.nodeIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 5: Attach context to sent messages**

In `handleSend`, after the user message is added to store and before `setIsProcessing(true)`, add context to the message. Modify the `store.addMessage` call for user messages to include context. The cleanest approach: instead of modifying the `addMessage` call, set context on the last message after adding it:

After `store.addMessage({ id: '', role: 'user', content: userMessage, timestamp: 0 });` (line ~37), add:

```typescript
    // Attach canvas context if present
    const currentContext = useStore.getState().chatContext;
    if (currentContext) {
      const ctxNodes = topology.nodes.filter((n) => currentContext.nodeIds.includes(n.id));
      const componentSummary = ctxNodes.map((n) => `${n.type} (${n.label})`).join(', ');
      const msgs = [...useStore.getState().messages];
      const lastUserMsg = msgs.findLast((m) => m.role === 'user');
      if (lastUserMsg) {
        lastUserMsg.context = { ...currentContext, componentSummary };
        useStore.setState({ messages: msgs });
      }
    }
```

- [ ] **Step 6: Replace header buttons**

Replace the existing header in the JSX (lines 197-208):

```tsx
      <div className="flex justify-between items-center mb-6 text-xs text-neutral-500 font-bold uppercase tracking-[0.2em] shrink-0">
        <span>{tr.chat.agent}</span>
        <div className="flex gap-3 items-center">
          <button
            className="hover:text-indigo-400 transition-colors text-[10px] px-2 py-1 rounded-lg hover:bg-indigo-500/10"
            onClick={newProject}
            title={tr.chat.newProject}
          >
            + {tr.chat.newProject}
          </button>
          <button
            className="hover:text-amber-400 transition-colors text-[10px] px-2 py-1 rounded-lg hover:bg-amber-500/10"
            onClick={clearChat}
            title={tr.chat.clearChat}
          >
            {tr.chat.clearChat}
          </button>
        </div>
      </div>
```

- [ ] **Step 7: Add context tag below header**

After the header div, add:

```tsx
      {chatContext && (
        <div className="mb-3 shrink-0 flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2 text-[11px]">
          <span className="text-indigo-400 font-bold">{tr.chat.linkedContext}</span>
          <span className="text-neutral-400">
            {chatContext.nodeIds.length} {tr.chat.components}
          </span>
          <button
            className="ml-auto text-neutral-500 hover:text-neutral-300"
            onClick={() => setChatContext(null)}
          >
            ×
          </button>
        </div>
      )}
```

- [ ] **Step 8: Save history after analysis completes**

In the SSE `data.done` handler (after `setIsProcessing(false)`), add:

```typescript
                useStore.getState().saveChatHistory();
```

Same for the JSON fallback path, add `useStore.getState().saveChatHistory();` after `setIsProcessing(false);`.

- [ ] **Step 9: Save history on unmount**

Add a cleanup effect:

```typescript
  useEffect(() => {
    return () => {
      useStore.getState().saveChatHistory();
    };
  }, []);
```

- [ ] **Step 10: Commit**

```bash
git add frontend/src/views/components/ChatPanel.tsx
git commit -m "feat: add new/clear buttons, context tag, history to ChatPanel"
```

---

### Task 7: Update AppLayout — Unread Badge

**File:** Modify `frontend/src/views/components/AppLayout.tsx`

- [ ] **Step 1: Read unread count from store**

Add to `AppLayout` function:

```typescript
  const unreadChatCount = useStore((s) => s.unreadChatCount);
  const resetUnread = useStore((s) => s.resetUnread);
```

- [ ] **Step 2: Add badge to Chat tab button**

Modify the Chat tab button (line ~87-96) to include the badge:

```tsx
            <button
              className={`pb-4 px-2 text-sm font-bold uppercase tracking-wide flex-1 border-b-[3px] transition-colors relative ${
                rightTab === 'chat'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
              onClick={() => { setRightTab('chat'); resetUnread(); }}
            >
              {tr.chat.tab}
              {unreadChatCount > 0 && rightTab !== 'chat' && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-neutral-900" />
              )}
            </button>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/components/AppLayout.tsx
git commit -m "feat: add unread badge to Chat tab"
```

---

### Task 8: Add i18n Strings

**File:** Modify `frontend/src/services/i18n.ts`

- [ ] **Step 1: Add canvas context menu strings**

In the `zh` block under `topology`, after `exportSvg` (find the line), add a new `canvas` section:

In the `zh.chat` object, add:
```
    newProject: '新建项目',
    clearChat: '清空聊天',
    linkedContext: '已关联',
    components: '个元器件',
```

In the `zh` object, add after `topology`:
```
  canvas: {
    discussSingle: '完善此元器件细节',
    discussSelection: '讨论框选区域',
    detailChat: '发起细节对话',
    selectFirst: '请先框选元器件',
  },
```

- [ ] **Step 2: Add English equivalents**

In the `en` block, add matching translations:

In `en.chat`:
```
    newProject: 'New Project',
    clearChat: 'Clear Chat',
    linkedContext: 'Linked',
    components: 'components',
```

In `en` object:
```
  canvas: {
    discussSingle: 'Refine Component Details',
    discussSelection: 'Discuss Selected Region',
    detailChat: 'Start Detail Chat',
    selectFirst: 'Select components first',
  },
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/i18n.ts
git commit -m "feat: add i18n strings for canvas chat interaction"
```

---

### Task 9: Verify and Build

- [ ] **Step 1: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Build**

```bash
cd frontend && npx vite build
```

Expected: Build succeeds.

- [ ] **Step 3: Run backend tests**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: 17 passed.

- [ ] **Step 4: Rebuild containers**

```bash
docker compose up -d --build
```

- [ ] **Step 5: Smoke test**

Verify `http://localhost` loads, then:
1. Right-click a component node → context menu appears
2. Click "完善此元器件细节" → chat switches, prompt prefilled
3. Click a node → NodeInfoCard appears in bottom-right
4. Click "New Project" → canvas and BOM clear
5. Refresh page → chat history restored

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verify build and integration"
```
