import { useRef, useEffect } from 'react';
import { useStore } from '../../models/store';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ProgressStepper } from './ProgressStepper';
import { runFullAnalysis } from '../../services/analysis';

export function ChatPanel() {
  const { project, messages, stage } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const handleSend = async (text: string) => {
    try {
      await runFullAnalysis(text);
    } catch (err: any) {
      useStore.getState().addMessage({
        id: '', role: 'system',
        content: `Error: ${err.message}`, timestamp: 0,
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-[var(--color-border)]">
        <h1 className="font-semibold text-lg">EE Assistant</h1>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          {project ? `Project: ${project.id.slice(0, 8)}...` : 'New session'}
        </p>
      </div>

      <ProgressStepper />

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-center text-[var(--color-text-tertiary)] text-sm mt-8">
            Describe your electrical control requirements to get started.
            <br /><br />
            Example: "Design a conveyor system with 3 motors, E-Stop, and interlock logic"
          </div>
        )}
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
      </div>

      <ChatInput onSend={handleSend} disabled={stage === 'analyzing' || stage === 'selecting'} />
    </div>
  );
}
