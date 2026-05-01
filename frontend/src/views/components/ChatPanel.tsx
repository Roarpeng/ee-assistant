import { useRef, useEffect } from 'react';
import { useStore } from '../../models/store';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { api } from '../../services/api';

export function ChatPanel() {
  const { project, messages, stage, addMessage, setProject, setStage, updateProgress } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const handleSend = async (text: string) => {
    addMessage({ id: '', role: 'user', content: text, timestamp: 0 });

    let p = project;
    if (!p) {
      p = await api.createProject('New Project');
      setProject(p);
    }

    setStage('analyzing');
    updateProgress({ stage: 'analyzing', message: 'Analyzing requirements...' });

    try {
      const updated = await api.analyze(p!.id, text);
      setProject(updated);
      setStage('ready');

      const req = updated.requirement;
      if (req) {
        const summary = [
          `**Requirement Analysis**`,
          `- Machine: ${req.machineType || 'N/A'}`,
          `- Safety: ${req.safetyLevel || 'N/A'}`,
          `- IO Points: ${req.ioItems.length}`,
          `- Control Rules: ${req.logicRules.length}`,
        ].join('\n');
        addMessage({ id: '', role: 'assistant', content: summary, timestamp: 0 });
        updateProgress({ stage: 'ready', message: 'Analysis complete. Ready for component selection.' });
      }
    } catch (err: any) {
      updateProgress({ stage: 'idle', message: `Error: ${err.message}` });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h1 className="font-semibold text-lg">EE Assistant</h1>
        <p className="text-xs text-gray-400">
          {project ? `Project: ${project.id.slice(0, 8)}...` : 'New session'}
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">
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
