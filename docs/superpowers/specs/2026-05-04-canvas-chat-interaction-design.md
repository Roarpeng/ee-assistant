# Canvas-Chat Interaction Enhancement — Design Spec

**Date:** 2026-05-04
**Scope:** 5 features — right-click contextual chat, new conversation flow, history persistence, node info preview, unread badge

## Data Model

### Zustand Store additions (`store.ts`)

```typescript
interface AppState {
  // ... existing fields ...

  // NEW: canvas chat context (set by right-click on nodes)
  chatContext: {
    nodeIds: string[];
    mode: 'single' | 'selection';  // single component detail vs. topology region
  } | null;

  // NEW: per-project chat history (in-memory cache of localStorage)
  projectHistories: Record<string, ChatMessage[]>;

  // NEW: node preview (click, not right-click)
  previewNodeId: string | null;

  // NEW: unread count for Chat tab badge
  unreadChatCount: number;

  // NEW actions
  setChatContext: (ctx: AppState['chatContext']) => void;
  setPreviewNodeId: (id: string | null) => void;
  saveProjectHistory: (projectId: string) => void;
  loadProjectHistory: (projectId: string) => void;
  incrementUnread: () => void;
  resetUnread: () => void;
  resetCanvasWorkspace: () => void;  // clear topology + BOM + ST + messages
}
```

### ChatMessage extension

```typescript
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  // NEW: attached canvas context for this message
  context?: {
    nodeIds: string[];
    componentSummary: string;  // e.g. "PLC_CPU (Siemens S7-1200), Power_Supply (ABB PS-24V)"
  };
}
```

### localStorage keys

| Key | Format | Purpose |
|-----|--------|---------|
| `volta-chat-history` | `{ [projectId]: ChatMessage[] }` | Per-project message history |

---

## Component Architecture

```
TopologyPanel.tsx (modified)
  ├── CanvasContextMenu.tsx (NEW) — right-click popup
  ├── NodeInfoCard.tsx (NEW) — click-to-preview overlay
  └── ReactFlow (existing, add event handlers)

ChatPanel.tsx (modified)
  ├── header: [New Project] [Clear Chat] buttons
  ├── context tag: "🔗 已关联 N 个元器件"
  └── message list (existing)

AppLayout.tsx (modified)
  └── Chat tab: unread badge dot
```

### New files

| File | Responsibility |
|------|---------------|
| `views/components/CanvasContextMenu.tsx` | Right-click popup: position, menu items, click-outside-to-dismiss |
| `views/components/NodeInfoCard.tsx` | Click-to-preview card: component name, type, specs, confidence badge |
| `hooks/useChatHistory.ts` | localStorage read/write, LRU trim to 100 msgs/project, load/restore |

### Modified files

| File | Changes |
|------|---------|
| `models/store.ts` | Add `chatContext`, `projectHistories`, `previewNodeId`, `unreadChatCount` + actions |
| `views/components/TopologyPanel.tsx` | `onNodeContextMenu`, `onNodeClick`, `onPaneClick` (dismiss) |
| `views/components/ChatPanel.tsx` | New project button, clear chat button, context tag, history load, auto-prompt |
| `views/components/AppLayout.tsx` | Unread badge on Chat tab, resetUnread on tab switch |
| `views/components/BOMPanel.tsx` | Accept `highlightId` prop for message-to-BOM navigation |

---

## Interaction Flows

### Flow 1: Right-click → Contextual Chat

```
1. User right-clicks a node in TopologyPanel
   → onNodeContextMenu fires
   → set chatContext({ nodeIds: [node.id], mode: 'single' })
   → CanvasContextMenu appears at mouse position

2. User right-clicks pane with selected nodes
   → onPaneContextMenu fires (if selected nodes > 0)
   → set chatContext({ nodeIds: selectedIds, mode: 'selection' })

3. User clicks menu item "完善此元器件细节" or "讨论框选区域"
   → switch activeCanvasTab to 'chat' (if right panel not already chat, switch rightTab)
   → compose context prompt in input field:
     mode='single': "请帮我完善 {component label} 的规格参数和选型建议"
     mode='selection': "请分析以下拓扑区域内的元器件: {component summary}"
   → attach context to subsequent message
   → menu dismisses
```

### Flow 2: New Conversation

```
[New Project] button:
  1. Save current project history to localStorage
  2. POST /api/projects?name=New%20Project → new projectId
  3. resetCanvasWorkspace(): clear topology, BOM, ST, messages, chatContext
  4. setProject(newProject)

[Clear Chat] button:
  1. Save current messages to localStorage
  2. Clear messages[] only (keep topology, BOM, ST)
  3. Clear chatContext
```

### Flow 3: History Persistence

```
Page load:
  1. Store initializes → loadProjectHistory(currentProjectId)
  2. If history exists in localStorage → hydrate messages[]
  3. Messages with context display context badge

Analysis complete:
  1. saveProjectHistory(projectId) → write to localStorage
  2. Trim to 100 most recent messages per project

Project switch:
  1. Save old project history
  2. Load new project history
```

### Flow 4: Node Click Preview

```
1. User clicks a node (not right-click)
   → onNodeClick fires
   → setPreviewNodeId(node.id)
   → NodeInfoCard slides in above the node

2. NodeInfoCard shows:
   - Component type icon + label
   - Status indicator (ok/warning/error)
   - If BOM data available: manufacturer, model, confidence badge
   - "详情对话" button → triggers Flow 1 single mode

3. Click elsewhere or Escape → dismiss preview
```

### Flow 5: Unread Badge

```
1. AI analysis starts → SSE streaming
2. Each SSE step event → if activeTab !== 'chat' → incrementUnread()
3. User switches to Chat tab → resetUnread()
4. Badge shows as small red dot on Chat tab button in AppLayout
```

---

## Backend Changes

None. All features are frontend-only. The existing `/api/projects` and `/api/projects/{id}/analyze-v2` endpoints support the new flows unchanged.

---

## Edge Cases & States

| Scenario | Handling |
|----------|----------|
| Right-click with 0 selected nodes | Show "select nodes first" tip in menu |
| localStorage full | Catch quota error, warn user, keep in-memory |
| Project deleted | Remove history entry from localStorage |
| Rapid node clicks | Debounce preview, 200ms |
| Same node right-clicked again | Re-position menu, keep same context |
| Chat during analysis | Disable send button (existing behavior) |
| Empty project history | Show welcome message (existing behavior) |
| Box-select across 20+ nodes | Summarize to top 10 by edge count, note "and N more" |

---

## Recommended Follow-ups (not in this scope)

- **#2 from brainstorming:** Message-to-BOM link highlighting — AI mentions component name → clickable link → BOM tab with row highlight
- Drag-and-drop a component from BOM table onto canvas
- Export canvas selection as PDF sub-schematic
