import { create } from 'zustand';
import { type Lang, getInitialLang } from '../services/i18n';

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

// ===== LLM Settings =====
export interface LLMSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
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
    chat: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
    embedding: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small' },
  };
}

function saveSettings(s: AppSettings) {
  localStorage.setItem('ee-settings', JSON.stringify(s));
}

interface AppState {
  topology: { nodes: NodeData[]; edges: EdgeData[]; source?: 'ai' | 'user' };
  bom: BOMItem[];
  sclCode: string;
  project: { id: string; name: string } | null;
  stage: AnalysisStage;
  messages: ChatMessage[];
  activeCanvasTab: 'topology' | 'bom' | 'code';
  theme: 'light' | 'dark';
  language: Lang;
  settings: AppSettings;

  setTopology: (nodes: NodeData[], edges: EdgeData[], source?: 'ai' | 'user') => void;
  setBOM: (bom: BOMItem[]) => void;
  setSCLCode: (code: string) => void;
  setProject: (p: { id: string; name: string }) => void;
  setStage: (s: AnalysisStage) => void;
  addMessage: (m: ChatMessage) => void;
  setActiveCanvasTab: (tab: 'topology' | 'bom' | 'code') => void;
  toggleTheme: () => void;
  toggleLanguage: () => void;
  updateSettings: (s: AppSettings) => void;
}

let msgCounter = 0;

export const useStore = create<AppState>((set) => ({
  topology: {
    nodes: [],
    edges: [],
  },
  bom: [],
  sclCode: '',

  project: null,
  stage: 'idle',
  messages: [],
  activeCanvasTab: 'topology',
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'dark',
  language: getInitialLang(),
  settings: loadSettings(),

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
}));
