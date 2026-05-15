import type { ChatMessage } from '../models/store';

export interface ConversationMeta {
  id: string;
  name: string;
  lastMessage: string;
  updatedAt: number;
}

export const CONVERSATIONS_KEY = 'volta-conversations';
export const CHAT_HISTORY_KEY = 'volta-chat-history';

export function deriveConversationTitle(messages: ChatMessage[], fallback = '新对话'): string {
  const firstUserMessage = messages.find((message) => message.role === 'user' && message.content.trim());
  if (!firstUserMessage) return fallback;

  const [firstClause] = firstUserMessage.content.trim().split(/[\n，。！？；,.!?;]/);
  const title = (firstClause || firstUserMessage.content).trim();
  return title.slice(0, 28) || fallback;
}

export const buildConversationTitle = deriveConversationTitle;

export function loadConversationMetas(): ConversationMeta[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveConversationMetas(list: ConversationMeta[]) {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(list));
  } catch {}
}

export function saveConversationMessages(projectId: string, messages: ChatMessage[]) {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    const all: Record<string, ChatMessage[]> = raw ? JSON.parse(raw) : {};
    all[projectId] = messages.slice(-100);
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(all));
  } catch {}
}

export function deleteConversationHistory(projectId: string) {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return;
    const all: Record<string, ChatMessage[]> = JSON.parse(raw);
    delete all[projectId];
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(all));
  } catch {}
}

export function clearConversationStorage() {
  try {
    localStorage.removeItem(CONVERSATIONS_KEY);
    localStorage.removeItem(CHAT_HISTORY_KEY);
    localStorage.removeItem('volta-last-project');
  } catch {}
}
