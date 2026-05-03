import { create } from 'zustand';
import type { Project } from './project';
import type { BOMItem } from './selection';
import type { Schematic } from './schematic';
import type { STModule } from './codegen';

export type AnalysisStage = 'idle' | 'analyzing' | 'ready' | 'selecting' | 'generating_schematic' | 'generating_code' | 'done';

export interface ProgressInfo {
  stage: AnalysisStage;
  message: string;
}

interface AppState {
  project: Project | null;
  stage: AnalysisStage;
  messages: ChatMessage[];
  activeCanvasTab: 'diagram' | 'bom' | 'code';
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  setProject: (p: Project) => void;
  setStage: (s: AnalysisStage) => void;
  addMessage: (m: ChatMessage) => void;
  updateProgress: (p: ProgressInfo) => void;
  setActiveCanvasTab: (tab: 'diagram' | 'bom' | 'code') => void;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  stage?: AnalysisStage;
}

let msgCounter = 0;

export const useStore = create<AppState>((set) => ({
  project: null,
  stage: 'idle',
  messages: [],
  activeCanvasTab: 'diagram',
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
  toggleTheme: () => set((s) => {
    const next = s.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
    return { theme: next };
  }),

  setProject: (p) => set({ project: p }),
  setStage: (s) => set({ stage: s }),

  addMessage: (m) => set((s) => ({
    messages: [...s.messages, { ...m, id: String(++msgCounter), timestamp: Date.now() }],
  })),

  updateProgress: (p) => set((s) => ({
    stage: p.stage,
    messages: [...s.messages, {
      id: String(++msgCounter),
      role: 'system' as const,
      content: p.message,
      timestamp: Date.now(),
      stage: p.stage,
    }],
  })),

  setActiveCanvasTab: (tab) => set({ activeCanvasTab: tab }),
}));
