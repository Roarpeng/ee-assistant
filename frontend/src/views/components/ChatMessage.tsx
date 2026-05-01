import type { ChatMessage as ChatMessageType } from '../../models/store';

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
        isUser
          ? 'bg-blue-600 text-white'
          : isSystem
            ? 'bg-gray-100 text-gray-500 italic'
            : 'bg-gray-100 text-gray-900'
      }`}>
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
}
