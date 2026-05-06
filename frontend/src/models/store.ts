import { create } from 'zustand';
import { type Lang, getInitialLang } from '../services/i18n';
import {
  mergeAITopology,
  getTopologySnapshot,
  resetYjsDoc,
} from './yjsStore';

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

// ===== Knowledge Types =====
export type KnowledgeDocStatus =
  | 'uploading'
  | 'chunking'
  | 'embedding'
  | 'graph_extracting'
  | 'ready'
  | 'error';

export interface KnowledgeDoc {
  id: string;
  filename: string;
  manufacturer: string;
  category_tags: string[];
  chunk_count: number;
  status: KnowledgeDocStatus;
  uploaded_at: string;
}

// ===== App State =====
export type AnalysisStage =
  | 'idle'
  | 'analyzing'
  | 'selecting'
  | 'generating_schematic'
  | 'generating_code'
  | 'done';

export interface ChatContext {
  nodeIds: string[];
  mode: 'single' | 'selection';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  context?: ChatContext & { componentSummary?: string };
}

export type NewConversationMode = 'clear-canvas' | 'keep-canvas';

// ===== LLM Settings =====
export interface LLMSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  dimension?: number;
}

export interface AppSettings {
  chat: LLMSettings;
  embedding: LLMSettings;
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem('ee-settings');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    chat: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', maxTokens: 4096, temperature: 0.1 },
    embedding: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small', dimension: 4096 },
  };
}

function saveSettings(s: AppSettings) {
  localStorage.setItem('ee-settings', JSON.stringify(s));
}

interface AppState {
  topology: { nodes: NodeData[]; edges: EdgeData[]; source?: 'ai' | 'user' };
  yTopologyVersion: number; // incremented on every Yjs→Zustand sync
  bom: BOMItem[];
  sclCode: string;
  project: { id: string; name: string } | null;
  stage: AnalysisStage;
  messages: ChatMessage[];
  activeCanvasTab: 'topology' | 'bom' | 'code';
  theme: 'light' | 'dark';
  language: Lang;
  settings: AppSettings;
  knowledgeDocs: KnowledgeDoc[];
  knowledgeSelectionMode: boolean;
  selectedDocIds: Set<string>;
  knowledgeLoading: boolean;
  chatContext: ChatContext | null;
  previewNodeId: string | null;
  unreadChatCount: number;

  setTopology: (nodes: NodeData[], edges: EdgeData[], source?: 'ai' | 'user') => void;
  syncTopologyFromYjs: () => void;
  setBOM: (bom: BOMItem[]) => void;
  setSCLCode: (code: string) => void;
  setProject: (p: { id: string; name: string }) => void;
  setStage: (s: AnalysisStage) => void;
  addMessage: (m: ChatMessage) => void;
  setActiveCanvasTab: (tab: 'topology' | 'bom' | 'code') => void;
  toggleTheme: () => void;
  toggleLanguage: () => void;
  updateSettings: (s: AppSettings) => void;
  setKnowledgeDocs: (docs: KnowledgeDoc[]) => void;
  toggleKnowledgeSelectionMode: () => void;
  toggleDocSelection: (id: string) => void;
  selectAllDocs: () => void;
  clearDocSelection: () => void;
  setKnowledgeLoading: (loading: boolean) => void;
  setChatContext: (ctx: ChatContext | null) => void;
  setPreviewNodeId: (id: string | null) => void;
  newProject: (options?: { preserveCanvas?: boolean }) => Promise<void>;
  clearChat: () => void;
  resetCanvasWorkspace: () => void;
  incrementUnread: () => void;
  resetUnread: () => void;
  saveChatHistory: () => void;
  loadChatHistory: () => void;
}

let msgCounter = 0;

export const useStore = create<AppState>((set) => ({
  topology: {
    nodes: [],
    edges: [],
  },
  yTopologyVersion: 0,
  bom: [],
  sclCode: '',

  project: null,
  stage: 'idle',
  messages: [],
  activeCanvasTab: 'topology',
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'dark',
  language: getInitialLang(),
  settings: loadSettings(),
  knowledgeDocs: [],
  knowledgeSelectionMode: false,
  selectedDocIds: new Set<string>(),
  knowledgeLoading: false,
  chatContext: null,
  previewNodeId: null,
  unreadChatCount: 0,

  setTopology: (nodes, edges, source = 'user') => {
    if (source === 'ai') {
      // Route AI writes through Yjs for CRDT merge (preserves user x,y)
      mergeAITopology(nodes, edges);
      // Sync merged result back into Zustand for non-ReactFlow subscribers
      const snapshot = getTopologySnapshot();
      set((s) => ({
        topology: { nodes: snapshot.nodes, edges: snapshot.edges, source },
        yTopologyVersion: s.yTopologyVersion + 1,
      }));
    } else {
      set({ topology: { nodes, edges, source } });
    }
  },

  syncTopologyFromYjs: () => {
    const snapshot = getTopologySnapshot();
    set((s) => ({
      topology: { nodes: snapshot.nodes, edges: snapshot.edges, source: s.topology.source },
      yTopologyVersion: s.yTopologyVersion + 1,
    }));
  },
  setBOM: (bom) => set({ bom }),
  setSCLCode: (sclCode) => set({ sclCode }),
  setProject: (p) => {
    try { localStorage.setItem('volta-last-project', JSON.stringify(p)); } catch {}
    set({ project: p });
  },
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
  toggleLanguage: () =>
    set((s) => {
      const next = s.language === 'zh' ? 'en' : 'zh';
      localStorage.setItem('volta-lang', next);
      return { language: next };
    }),
  updateSettings: (s) => {
    saveSettings(s);
    set({ settings: s });
  },
  setKnowledgeDocs: (knowledgeDocs) => set({ knowledgeDocs }),
  toggleKnowledgeSelectionMode: () =>
    set((s) => ({
      knowledgeSelectionMode: !s.knowledgeSelectionMode,
      selectedDocIds: new Set<string>(),
    })),
  toggleDocSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedDocIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedDocIds: next };
    }),
  selectAllDocs: () =>
    set((s) => ({
      selectedDocIds: new Set(s.knowledgeDocs.map((d) => d.id)),
    })),
  clearDocSelection: () => set({ selectedDocIds: new Set<string>() }),
  setKnowledgeLoading: (knowledgeLoading) => set({ knowledgeLoading }),

  setChatContext: (chatContext) => set({ chatContext }),
  setPreviewNodeId: (previewNodeId) => set({ previewNodeId }),

  resetCanvasWorkspace: () => {
    resetYjsDoc();
    set({
      topology: { nodes: [], edges: [] },
      yTopologyVersion: 0,
      bom: [],
      sclCode: '',
      messages: [],
      chatContext: null,
      previewNodeId: null,
      stage: 'idle',
    });
  },

  clearChat: () => {
    const s = useStore.getState();
    if (s.project) {
      try {
        const raw = localStorage.getItem('volta-chat-history');
        const all: Record<string, ChatMessage[]> = raw ? JSON.parse(raw) : {};
        all[s.project.id] = s.messages;
        localStorage.setItem('volta-chat-history', JSON.stringify(all));
      } catch {}
    }
    set({ messages: [], chatContext: null });
  },

  newProject: async (options) => {
    const s = useStore.getState();
    const preserveCanvas = options?.preserveCanvas ?? false;
    const preservedCanvas = {
      topology: s.topology,
      yTopologyVersion: s.yTopologyVersion,
      bom: s.bom,
      sclCode: s.sclCode,
      activeCanvasTab: s.activeCanvasTab,
    };
    if (s.project) {
      try {
        const raw = localStorage.getItem('volta-chat-history');
        const all: Record<string, ChatMessage[]> = raw ? JSON.parse(raw) : {};
        all[s.project.id] = s.messages;
        localStorage.setItem('volta-chat-history', JSON.stringify(all));
      } catch {}
    }
    try {
      const { api } = await import('../services/api');
      const { deriveConversationTitle } = await import('../services/conversations');
      const projectName = preserveCanvas
        ? `继续：${deriveConversationTitle(s.messages, '当前画布')}`
        : 'New Project';
      const p = await api.createProject(projectName);
      if (!preserveCanvas) resetYjsDoc();
      set({
        project: p,
        topology: preserveCanvas ? preservedCanvas.topology : { nodes: [], edges: [] },
        yTopologyVersion: preserveCanvas ? preservedCanvas.yTopologyVersion : 0,
        bom: preserveCanvas ? preservedCanvas.bom : [],
        sclCode: preserveCanvas ? preservedCanvas.sclCode : '',
        messages: [],
        chatContext: null,
        previewNodeId: null,
        stage: 'idle',
        unreadChatCount: 0,
        activeCanvasTab: preserveCanvas ? preservedCanvas.activeCanvasTab : 'topology',
      });
    } catch {
      if (!preserveCanvas) resetYjsDoc();
      const fallbackId = 'proj_' + Date.now();
      set({
        project: { id: fallbackId, name: preserveCanvas ? '继续当前画布' : 'New Project' },
        topology: preserveCanvas ? preservedCanvas.topology : { nodes: [], edges: [] },
        yTopologyVersion: preserveCanvas ? preservedCanvas.yTopologyVersion : 0,
        bom: preserveCanvas ? preservedCanvas.bom : [],
        sclCode: preserveCanvas ? preservedCanvas.sclCode : '',
        messages: [],
        chatContext: null,
        previewNodeId: null,
        stage: 'idle',
        unreadChatCount: 0,
        activeCanvasTab: preserveCanvas ? preservedCanvas.activeCanvasTab : 'topology',
      });
    }
  },

  incrementUnread: () => set((s) => ({ unreadChatCount: s.unreadChatCount + 1 })),
  resetUnread: () => set({ unreadChatCount: 0 }),

  saveChatHistory: () => {
    const s = useStore.getState();
    if (!s.project) return;
    try {
      const raw = localStorage.getItem('volta-chat-history');
      const all: Record<string, ChatMessage[]> = raw ? JSON.parse(raw) : {};
      all[s.project.id] = s.messages.slice(-100);
      localStorage.setItem('volta-chat-history', JSON.stringify(all));
    } catch {}
  },

  loadChatHistory: () => {
    const s = useStore.getState();
    // If no project in state, try to restore last project from localStorage
    if (!s.project) {
      try {
        const saved = localStorage.getItem('volta-last-project');
        if (saved) {
          const p = JSON.parse(saved);
          if (p && p.id) {
            set({ project: p });
          }
        }
      } catch {}
    }
    const pid = s.project?.id;
    if (!pid) return;
    try {
      const raw = localStorage.getItem('volta-chat-history');
      if (!raw) return;
      const all: Record<string, ChatMessage[]> = JSON.parse(raw);
      const msgs = all[pid];
      if (msgs && msgs.length > 0) {
        set({ messages: msgs });
        const maxId = msgs.reduce((max: number, m: any) => Math.max(max, parseInt(m.id) || 0), 0);
        msgCounter = maxId;
      }
    } catch {}
  },
}));
