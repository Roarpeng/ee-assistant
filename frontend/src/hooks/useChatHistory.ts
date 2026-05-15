import { useEffect, useCallback } from 'react';
import { useStore } from '../models/store';
import { CHAT_HISTORY_KEY, CONVERSATIONS_KEY } from '../services/conversations';

export function useChatHistory() {
  const project = useStore((s) => s.project);
  const messages = useStore((s) => s.messages);
  const loadChatHistory = useStore((s) => s.loadChatHistory);
  const saveChatHistory = useStore((s) => s.saveChatHistory);

  // Load history on mount (restores project + messages — server-first
  // with localStorage fallback, see store.loadChatHistory).
  useEffect(() => {
    void loadChatHistory();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load history when project changes (e.g., user creates or switches project)
  useEffect(() => {
    if (project) {
      void loadChatHistory(project.id);
    }
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save on message count changes (debounced)
  useEffect(() => {
    if (!project || messages.length === 0) return;
    const timer = setTimeout(() => saveChatHistory(), 1000);
    return () => clearTimeout(timer);
  }, [messages.length, project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearAllHistory = useCallback(() => {
    try {
      localStorage.removeItem(CHAT_HISTORY_KEY);
      localStorage.removeItem(CONVERSATIONS_KEY);
    } catch {}
  }, []);

  return { saveChatHistory, loadChatHistory, clearAllHistory };
}
