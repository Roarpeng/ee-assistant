import { ChatPanel } from './ChatPanel';
import { CanvasPanel } from './CanvasPanel';

export function AppLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="w-[30%] min-w-[320px] border-r border-gray-200 bg-white">
        <ChatPanel />
      </div>
      <div className="w-[70%] flex flex-col bg-gray-50">
        <CanvasPanel />
      </div>
    </div>
  );
}
