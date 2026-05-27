import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'success';
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, severity?: Toast['severity']) => void;
  dismiss: (id: string) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, severity = 'error') => {
    const id = `toast-${++counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, severity }] }));
  },
  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Convenience helper — call from anywhere (services, catch blocks, etc.) */
export const toast = {
  error: (msg: string) => useToastStore.getState().push(msg, 'error'),
  warning: (msg: string) => useToastStore.getState().push(msg, 'warning'),
  info: (msg: string) => useToastStore.getState().push(msg, 'info'),
  success: (msg: string) => useToastStore.getState().push(msg, 'success'),
};
