import { useState } from 'react';
import { ChatPanel } from './ChatPanel';
import { CanvasPanel } from './CanvasPanel';
import { KnowledgePanel } from './KnowledgePanel';

export function AppLayout() {
  const [leftTab, setLeftTab] = useState<'chat' | 'knowledge'>('chat');

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="w-[30%] min-w-[320px] border-r border-gray-200 bg-white flex flex-col">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setLeftTab('chat')}
            className={`flex-1 py-2 text-sm ${
              leftTab === 'chat'
                ? 'bg-white border-b-2 border-blue-600 font-medium'
                : 'bg-gray-50 text-gray-500'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setLeftTab('knowledge')}
            className={`flex-1 py-2 text-sm ${
              leftTab === 'knowledge'
                ? 'bg-white border-b-2 border-blue-600 font-medium'
                : 'bg-gray-50 text-gray-500'
            }`}
          >
            Knowledge
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          {leftTab === 'chat' ? <ChatPanel /> : <KnowledgePanel />}
        </div>
      </div>
      <div className="w-[70%] flex flex-col bg-gray-50">
        <CanvasPanel />
      </div>
    </div>
  );
}
