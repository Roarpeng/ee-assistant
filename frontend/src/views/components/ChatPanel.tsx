import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../models/store';
import { useChatHistory } from '../../hooks/useChatHistory';
import { api } from '../../services/api';
import { t } from '../../services/i18n';

export function ChatPanel() {
  const store = useStore();
  const { messages, project, language } = store;
  const tr = t(language);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useChatHistory();

  const chatContext = useStore((s) => s.chatContext);
  const setChatContext = useStore((s) => s.setChatContext);
  const newProject = useStore((s) => s.newProject);
  const clearChat = useStore((s) => s.clearChat);
  const topology = useStore((s) => s.topology);
  const resetUnread = useStore((s) => s.resetUnread);

  // Track whether LangGraph is paused waiting for human component selection
  const interruptedRef = useRef(false);
  const interruptedRef2 = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    resetUnread();
  }, []);

  useEffect(() => {
    return () => {
      useStore.getState().saveChatHistory();
    };
  }, []);

  // Auto-compose prompt when chatContext is set from canvas
  useEffect(() => {
    if (!chatContext) return;
    const ctxNodes = topology.nodes.filter((n) => chatContext.nodeIds.includes(n.id));
    if (ctxNodes.length === 0) return;
    const labels = ctxNodes.map((n) => n.label).join(', ');
    const prefix = chatContext.mode === 'single'
      ? `请帮我完善 "${ctxNodes[0].label}" 的规格参数和选型建议。`
      : `请分析以下拓扑区域内的元器件: ${labels}`;
    setInputValue(prefix);
  }, [chatContext?.nodeIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    // ... helper inside handleSend scope or component scope
    const updateLastMessage = (content: string) => {
      const msgs = [...useStore.getState().messages];
      const lastIdx = msgs.length - 1;
      if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
        msgs[lastIdx] = { ...msgs[lastIdx], content };
        useStore.setState({ messages: msgs });
      }
    };

    if (!inputValue.trim() || isProcessing) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    store.addMessage({ id: '', role: 'user', content: userMessage, timestamp: 0 });

    // Attach canvas context if present
    const currentCtx = useStore.getState().chatContext;
    if (currentCtx) {
      const ctxNodes = topology.nodes.filter((n) => currentCtx.nodeIds.includes(n.id));
      const componentSummary = ctxNodes.map((n) => `${n.type} (${n.label})`).join(', ');
      const msgs = [...useStore.getState().messages];
      let lastUserMsg = null;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') { lastUserMsg = msgs[i]; break; }
      }
      if (lastUserMsg) {
        lastUserMsg.context = { ...currentCtx, componentSummary };
        useStore.setState({ messages: msgs });
      }
    }

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

    // ── Resume flow: human provides manual component selection ──
    if (interruptedRef.current && p) {
      interruptedRef.current = false;
      let manualSelections: any[];
      try {
        const parsed = JSON.parse(userMessage);
        manualSelections = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // Free-text fallback: try to extract category and order number
        manualSelections = [{
          category: interruptedRef2.current?.not_found_categories?.[0] || '',
          manufacturer: '',
          order_number: userMessage.trim(),
          model: userMessage.trim(),
        }];
      }
      interruptedRef2.current = null;

      store.addMessage({
        id: '',
        role: 'assistant',
        content: '人工选型数据已接收，继续工程分析...',
        timestamp: 0,
      });

      try {
        const response = await api.resumeAnalysis(p.id, manualSelections);
        // ... SSE processing (same as below)
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/event-stream')) {
          if (!response.body) throw new Error('No body in response');
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let fullText = '';
          let buffer = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              try {
                const data = JSON.parse(trimmed.replace('data: ', ''));
                if (data.event === 'interrupt') {
                  setIsProcessing(false);
                  interruptedRef.current = true;
                  interruptedRef2.current = data.data;
                  const notFoundCats = data.data?.not_found_categories || [];
                  const interruptMsg = `${tr.chat.error}: 缺少匹配元器件: ${notFoundCats.join(', ')}。请提供确切的制造商和订货号。`;
                  fullText += '\n\n' + interruptMsg;
                  updateLastMessage(fullText);
                  store.addMessage({ id: '', role: 'system', content: interruptMsg, timestamp: 0 });
                  break;
                }
                if (data.done) {
                  setIsProcessing(false);
                  useStore.getState().saveChatHistory();
                  fullText += '\n\n' + tr.chat.completed;
                  updateLastMessage(fullText);
                  if (data.payload) {
                    const state = data.payload;
                    if (state.bom_items) {
                      useStore.getState().setBOM(state.bom_items.map((b: any, i: number) => ({
                        id: String(i + 1),
                        name: `${b.category || ''} ${b.model || ''}`.trim(),
                        mfg: b.manufacturer || 'Unknown',
                        pn: b.model || '',
                        qty: b.quantity || 1,
                        specs: Object.entries(b.specifications || {}).map(([k, v]) => `${k}: ${v}`).join(', ')
                      })));
                    }
                    if (state.topology && Array.isArray(state.topology.nodes) && state.topology.nodes.length > 0) {
                      useStore.getState().setTopology(state.topology.nodes, state.topology.edges || [], 'ai');
                      useStore.getState().setActiveCanvasTab('topology');
                    }
                    if (state.st_modules) {
                      const codeText = state.st_modules
                        .map((m: any) => `// ${m.name} (${m.module_type})\n${m.code}`)
                        .join('\n\n');
                      useStore.getState().setSCLCode(codeText);
                    }
                  }
                  break;
                } else if (data.step) {
                  fullText += (fullText ? '\n' : '') + data.step;
                  updateLastMessage(fullText);
                  useStore.getState().incrementUnread();
                }
              } catch (e) {
                console.error('Failed to parse SSE line:', line, e);
              }
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
      return;
    }

    store.addMessage({
      id: '',
      role: 'assistant',
      content: tr.chat.initStatus,
      timestamp: 0,
    });

    try {
      // Extract recent conversation history (last 10 non-system messages)
      const storeMessages = useStore.getState().messages;
      const history = storeMessages
        .filter(m => m.role !== 'system')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

      const response = await api.analyzeV2SSE(p.id, userMessage, history);
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        if (!response.body) throw new Error('No body in response');
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullText = '';
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep partial line

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            
            try {
              const data = JSON.parse(trimmed.replace('data: ', ''));
              if (data.event === 'interrupt') {
                setIsProcessing(false);
                interruptedRef.current = true;
                interruptedRef2.current = data.data;
                const notFoundCats = data.data?.not_found_categories || [];
                const interruptMsg = `${tr.chat.error}: 缺少匹配元器件: ${notFoundCats.join(', ')}。请提供确切的制造商和订货号。`;
                fullText += '\n\n' + interruptMsg;
                updateLastMessage(fullText);
                store.addMessage({
                  id: '',
                  role: 'system',
                  content: interruptMsg,
                  timestamp: 0,
                });
                break;
              }
              if (data.done) {
                setIsProcessing(false);
                useStore.getState().saveChatHistory();
                fullText += '\n\n' + tr.chat.completed;
                updateLastMessage(fullText);

                if (data.payload) {
                  const state = data.payload;
                  console.log('AI Analysis Payload:', state);
                  
                  if (state.bom_items) {
                    console.log('Mapping BOM items...', state.bom_items.length);
                    useStore.getState().setBOM(state.bom_items.map((b: any, i: number) => ({
                      id: String(i + 1),
                      name: `${b.category || ''} ${b.model || ''}`.trim(),
                      mfg: b.manufacturer || 'Unknown',
                      pn: b.model || '',
                      qty: b.quantity || 1,
                      specs: Object.entries(b.specifications || {}).map(([k, v]) => `${k}: ${v}`).join(', ')
                    })));
                  }
                  
                  if (state.topology && Array.isArray(state.topology.nodes) && state.topology.nodes.length > 0) {
                    console.log('Mapping Structured Topology...', state.topology.nodes.length, 'nodes');
                    useStore.getState().setTopology(state.topology.nodes, state.topology.edges || [], 'ai');
                    useStore.getState().setActiveCanvasTab('topology');
                    console.log('Topology set in store and switched to tab.');
                  } else {
                    console.warn('No structured topology found in payload, or nodes empty.', state.topology);
                  }

                  if (state.st_modules) {
                    console.log('Mapping ST modules...', state.st_modules.length);
                    const codeText = state.st_modules
                      .map((m: any) => `// ${m.name} (${m.module_type})\n${m.code}`)
                      .join('\n\n');
                    useStore.getState().setSCLCode(codeText);
                  }
                }
                break;
              } else if (data.step) {
                fullText += (fullText ? '\n' : '') + data.step;
                updateLastMessage(fullText);
                useStore.getState().incrementUnread();
              }
            } catch (e) {
              console.error('Failed to parse SSE line:', line, e);
            }
          }
        }
      } else {
        // JSON fallback — backend returns full ProjectOut when processing completes
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`[${response.status}] ${errorText}`);
        }
        const projectData = await response.json();
        setIsProcessing(false);
        useStore.getState().saveChatHistory();

        const msgs = useStore.getState().messages;
        const lastIdx = msgs.length - 1;
        if (lastIdx >= 0) {
          msgs[lastIdx] = { ...msgs[lastIdx], content: tr.chat.completed };
          useStore.setState({ messages: [...msgs] });
        }

        // Extract BOM
        if (projectData.bom_items?.length) {
          useStore.getState().setBOM(
            projectData.bom_items.map((item: any) => ({
              id: item.id,
              name: `${item.category || ''} ${item.model || ''}`.trim(),
              mfg: item.manufacturer,
              pn: item.model,
              qty: item.quantity,
              specs: Object.entries(item.specifications || {}).map(([k, v]) => `${k}: ${v}`).join(', '),
            }))
          );
        }

        // Extract schematic
        if (projectData.schematic?.mermaid_code) {
          // Store mermaid in topology — FrameworkDiagram will render it
          useStore.getState().setTopology([], [], 'ai');
        }

        // Extract ST code
        if (projectData.code_modules?.length) {
          const codeText = projectData.code_modules
            .map((m: any) => `// ${m.name} (${m.module_type})\n${m.code}`)
            .join('\n\n');
          useStore.getState().setSCLCode(codeText);
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
        <div className="flex gap-3 items-center">
          <button
            className="hover:text-indigo-400 transition-colors text-[10px] px-2 py-1 rounded-lg hover:bg-indigo-500/10"
            onClick={() => { interruptedRef.current = false; interruptedRef2.current = null; newProject(); }}
            title={tr.chat.newProject}
          >
            + {tr.chat.newProject}
          </button>
          <button
            className="hover:text-amber-400 transition-colors text-[10px] px-2 py-1 rounded-lg hover:bg-amber-500/10"
            onClick={clearChat}
            title={tr.chat.clearChat}
          >
            {tr.chat.clearChat}
          </button>
        </div>
      </div>

      {chatContext && (
        <div className="mb-3 shrink-0 flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2 text-[11px]">
          <span className="text-indigo-400 font-bold">{tr.chat.linkedContext}</span>
          <span className="text-neutral-400">
            {chatContext.nodeIds.length} {tr.chat.components}
          </span>
          <button
            className="ml-auto text-neutral-500 hover:text-neutral-300"
            onClick={() => setChatContext(null)}
          >
            ×
          </button>
        </div>
      )}

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
          id="chat-input"
          name="chat-input"
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
