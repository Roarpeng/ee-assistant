import type { ChatMessage as ChatMessageType } from '../../models/store';

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] rounded-app-lg px-3 py-2 text-sm ${
        isUser
          ? 'bg-[var(--color-accent)] text-white'
          : isSystem
            ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] italic'
            : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]'
      }`}>
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
}
