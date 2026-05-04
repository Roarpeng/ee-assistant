import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../models/store';
import { api } from '../../services/api';
import { t } from '../../services/i18n';

export function ChatPanel() {
  const store = useStore();
  const { messages, project, language } = store;
  const tr = t(language);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    store.addMessage({ id: '', role: 'user', content: userMessage, timestamp: 0 });
    setIsProcessing(true);

    let p = project;
    if (!p) {
      try {
        p = await api.createProject('New Project');
        store.setProject(p);
      } catch {
        p = { id: '1', name: 'New Project' };
        store.setProject(p);
      }
    }

    store.addMessage({
      id: '',
      role: 'assistant',
      content: tr.chat.initStatus,
      timestamp: 0,
    });

    try {
      const response = await api.analyzeV2SSE(p.id, userMessage);
      if (!response.body) throw new Error('No body in response');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((line) => line.startsWith('data: '));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.replace('data: ', ''));
            if (data.done) {
              setIsProcessing(false);
              fullText += '\n\n' + tr.chat.completed;
              const msgs = useStore.getState().messages;
              const lastIdx = msgs.length - 1;
              if (lastIdx >= 0) {
                msgs[lastIdx] = { ...msgs[lastIdx], content: fullText };
                useStore.setState({ messages: [...msgs] });
              }

              if (data.payload) {
                if (data.payload.topology) {
                  useStore.getState().setTopology(
                    data.payload.topology.nodes,
                    data.payload.topology.edges,
                    'ai'
                  );
                }
                if (data.payload.bom) useStore.getState().setBOM(data.payload.bom);
                if (data.payload.sclCode) useStore.getState().setSCLCode(data.payload.sclCode);
              }
              break;
            } else if (data.step) {
              fullText += (fullText ? '\n' : '') + data.step;
              const msgs = useStore.getState().messages;
              const lastIdx = msgs.length - 1;
              if (lastIdx >= 0) {
                msgs[lastIdx] = { ...msgs[lastIdx], content: fullText };
                useStore.setState({ messages: [...msgs] });
              }
            }
          } catch {
            // skip unparseable lines
          }
        }
      }
    } catch (error: any) {
      setIsProcessing(false);
      store.addMessage({
        id: '',
        role: 'system',
        content: `${tr.chat.error}: ${error.message}`,
        timestamp: 0,
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden min-h-0">
      <div className="flex justify-between items-center mb-6 text-xs text-neutral-500 font-bold uppercase tracking-[0.2em] shrink-0">
        <span>{tr.chat.agent}</span>
        <div className="flex gap-3">
          <button className="hover:text-neutral-300">&rarr;</button>
          <button
            className="hover:text-neutral-300"
            onClick={() => useStore.setState({ messages: [] })}
          >
            &times;
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
        {messages.length === 0 && (
          <div className="text-center text-neutral-500 text-sm mt-8 px-4">
            {tr.chat.welcome}
            <br /><br />
            <span className="text-neutral-600">{tr.chat.example}</span>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
          >
            {msg.role !== 'user' && (
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 mt-1 ${
                  isProcessing && msg.role === 'assistant'
                    ? 'bg-indigo-500 text-white animate-pulse shadow-[0_0_15px_rgba(99,102,241,0.5)]'
                    : 'bg-indigo-500/20 text-indigo-400'
                }`}
              >
                V
              </div>
            )}
            <div
              className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-sm font-medium ml-8'
                  : 'bg-neutral-800 text-neutral-300 rounded-tl-sm font-mono text-xs mr-8 shadow-inner border border-neutral-700/50'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="mt-6 relative shrink-0">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={isProcessing ? tr.chat.processing : tr.chat.placeholder}
          disabled={isProcessing}
          className="w-full bg-neutral-800 border border-neutral-700 rounded-2xl py-4 pl-4 pr-20 text-sm text-white focus:outline-none focus:border-indigo-500 font-medium placeholder:text-neutral-500 transition-colors disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={isProcessing || !inputValue.trim()}
          className="absolute right-2 top-2 bottom-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-bold text-xs px-5 rounded-xl transition-colors"
        >
          {tr.chat.send}
        </button>
      </div>
    </div>
  );
}
