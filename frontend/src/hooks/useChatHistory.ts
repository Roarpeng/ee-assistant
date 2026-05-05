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

  // Auto-save on message count changes (debounced)
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
