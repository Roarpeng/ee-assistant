import { useState, useRef, useEffect } from 'react';
import { useStore, consumePendingSeedPrompt } from '../../models/store';
import { ClarifyCard } from './ClarifyCard';
import type { NodeData, EdgeData } from '../../models/store';
import { useChatHistory } from '../../hooks/useChatHistory';
import { api } from '../../services/api';
import { t } from '../../services/i18n';

const ENGINEERING_ANALYSIS_RE = /完整|生成|设计.*(系统|方案|控制)|选型|BOM|物料|拓扑|PLC|ST|SCL|代码|需求分析|控制系统|电气方案/;

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
  const bom = useStore((s) => s.bom);
  const sclCode = useStore((s) => s.sclCode);
  const activeCanvasTab = useStore((s) => s.activeCanvasTab);
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

  // Hero landing → newProject({ seedPrompt }) leaves a one-shot prompt that we
  // pop into the chat input here. Runs once per project switch.
  useEffect(() => {
    const seed = consumePendingSeedPrompt();
    if (seed) setInputValue(seed);
  }, [project?.id]);

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

  const updateLastMessage = (content: string) => {
    const msgs = [...useStore.getState().messages];
    const lastIdx = msgs.length - 1;
    if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
      msgs[lastIdx] = { ...msgs[lastIdx], content };
      useStore.setState({ messages: msgs });
    }
  };

  // Normalize topology coming from any source (LangGraph, chat orchestrator, LLM)
  // into the flat shape that our yjsStore + ReactFlow expects. Backend should
  // already do this, but we keep a defensive fallback so a misbehaving LLM
  // can never collapse the canvas to (0,0) or strip edge labels.
  const normalizeTopologyPayload = (raw: any): { nodes: NodeData[]; edges: EdgeData[] } => {
    const nodesIn: any[] = Array.isArray(raw?.nodes) ? raw.nodes : [];
    const nodes: NodeData[] = [];
    nodesIn.forEach((n, i) => {
      if (!n || typeof n !== 'object') return;
      const id = String(n.id ?? `node_${i}`).trim();
      if (!id) return;
      const data = n.data && typeof n.data === 'object' ? n.data : {};
      const pos = n.position && typeof n.position === 'object' ? n.position : {};
      const labelRaw =
        n.label ??
        data.label ??
        [data.manufacturer, data.model].filter(Boolean).join(' ').trim() ??
        '';
      const label = String(labelRaw || (n.type ?? 'NODE')).slice(0, 60);
      const x = Number.isFinite(+n.x) ? +n.x : Number.isFinite(+pos.x) ? +pos.x : 120 + (i % 6) * 220;
      const y = Number.isFinite(+n.y) ? +n.y : Number.isFinite(+pos.y) ? +pos.y : 60 + Math.floor(i / 6) * 140;
      nodes.push({
        id,
        type: String(n.type ?? 'io').toLowerCase(),
        label,
        x,
        y,
        status: (n.status ?? data.status ?? 'ok') as NodeData['status'],
      });
    });

    const validIds = new Set(nodes.map((n) => n.id));
    const edgesIn: any[] = Array.isArray(raw?.edges) ? raw.edges : [];
    const edges: EdgeData[] = [];
    edgesIn.forEach((e, i) => {
      if (!e || typeof e !== 'object') return;
      const source = String(e.source ?? '').trim();
      const target = String(e.target ?? '').trim();
      if (!source || !target || !validIds.has(source) || !validIds.has(target)) return;
      const data = e.data && typeof e.data === 'object' ? e.data : {};
      const protocol = String(e.protocol ?? e.label ?? data.protocol ?? data.label ?? 'PROFINET').slice(0, 32);
      // Backend `_normalize_topology` already attaches sourceHandle/targetHandle/category
      // — pass them through so ReactFlow renders the right port + color.
      // If absent (older runs / manually authored), TopologyPanel.observeTopology
      // falls back to a protocol→side classifier.
      const sourceHandle = typeof e.sourceHandle === 'string' ? e.sourceHandle : undefined;
      const targetHandle = typeof e.targetHandle === 'string' ? e.targetHandle : undefined;
      const category =
        e.category === 'power' || e.category === 'network' ||
        e.category === 'safety' || e.category === 'feedback'
          ? e.category
          : undefined;
      edges.push({
        id: String(e.id ?? `e_${i}_${source}_${target}`),
        source,
        target,
        protocol,
        ...(sourceHandle ? { sourceHandle } : {}),
        ...(targetHandle ? { targetHandle } : {}),
        ...(category ? { category } : {}),
      });
    });
    return { nodes, edges };
  };

  const applyAnalysisPayload = (state: any) => {
    if (!state) return;
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
      const { nodes, edges } = normalizeTopologyPayload(state.topology);
      if (nodes.length > 0) {
        useStore.getState().setTopology(nodes, edges, 'ai');
        useStore.getState().setActiveCanvasTab('topology');
      }
    }
    if (state.st_modules) {
      const codeText = state.st_modules
        .map((m: any) => `// ${m.name} (${m.module_type})\n${m.code}`)
        .join('\n\n');
      useStore.getState().setSCLCode(codeText);
    }
    if (state.project_meta) {
      useStore.getState().setProjectMeta({
        safetyLevel: state.project_meta.safety_level ?? undefined,
        bomCost: state.project_meta.bom_cost ?? undefined,
      });
    }
    if (Array.isArray(state.io_budget)) {
      useStore.getState().setBudgetItems(state.io_budget);
    }
    if (Array.isArray(state.commissioning_steps)) {
      useStore.getState().setCommissioningSteps(state.commissioning_steps);
    }
    if (Array.isArray(state.io_items)) {
      useStore.getState().setIOItems(state.io_items);
    }
  };

  const buildCanvasContext = () => {
    const selectedNodes = chatContext
      ? topology.nodes.filter((n) => chatContext.nodeIds.includes(n.id))
      : topology.nodes;
    return {
      active_tab: activeCanvasTab,
      selected_context: chatContext,
      nodes: selectedNodes.slice(0, 30),
      edges: topology.edges.slice(0, 60),
      bom_items: bom.slice(0, 30),
      code_preview: sclCode ? sclCode.slice(0, 1200) : '',
    };
  };

  const shouldRunFullAnalysis = (message: string) => {
    const userTurns = useStore.getState().messages.filter((m) => m.role === 'user').length;
    const hasCanvas = topology.nodes.length > 0 || bom.length > 0 || Boolean(chatContext);
    return !hasCanvas && userTurns <= 1 && ENGINEERING_ANALYSIS_RE.test(message);
  };

  const readStream = async (
    response: Response,
    mode: 'chat' | 'analysis' | 'resume',
  ) => {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`[${response.status}] ${errorText}`);
      }
      const projectData = await response.json();
      updateLastMessage(tr.chat.completed);
      applyAnalysisPayload({
        bom_items: projectData.bom_items,
        mermaid_code: projectData.schematic?.mermaid_code,
        st_modules: projectData.code_modules,
      });
      return;
    }

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
          if (data.error) throw new Error(data.error);

          if (data.event === 'interrupt') {
            interruptedRef.current = true;
            interruptedRef2.current = data.data;
            const notFoundCats = data.data?.not_found_categories || [];
            const interruptMsg = `${tr.chat.error}: 缺少匹配元器件: ${notFoundCats.join(', ')}。请提供确切的制造商和订货号。`;
            updateLastMessage(`${fullText}\n\n${interruptMsg}`.trim());
            store.addMessage({ id: '', role: 'system', content: interruptMsg, timestamp: 0 });
            return;
          }

          if (data.done) {
            if (mode === 'chat' && data.payload?.answer) {
              updateLastMessage(data.payload.answer);
              const currentProject = useStore.getState().project;
              if (currentProject && data.payload.title) {
                store.setProject({ id: currentProject.id, name: data.payload.title });
              }
              applyAnalysisPayload(data.payload);
            } else {
              updateLastMessage(`${fullText}\n\n${tr.chat.completed}`.trim());
              applyAnalysisPayload(data.payload);
            }
            useStore.getState().saveChatHistory();
            return;
          }

          if (data.step) {
            fullText += `${fullText ? '\n' : ''}• ${data.step}`;
            updateLastMessage(fullText);
            useStore.getState().incrementUnread();
          }

          // Progressive rendering: every node may carry a `partial` slice
          // (BOM, topology, code) that we can render *immediately* — the user
          // sees each artifact appear as it's generated instead of waiting for
          // the whole graph to finish.
          if (data.partial) {
            applyAnalysisPayload(data.partial);
          }
        } catch (e) {
          console.error('Failed to parse SSE line:', line, e);
          throw e;
        }
      }
    }
  };

  const handleSend = async () => {
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
        await readStream(response, 'resume');
      } catch (error: any) {
        store.addMessage({
          id: '',
          role: 'system',
          content: `${tr.chat.error}: ${error.message}`,
          timestamp: 0,
        });
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    const runFullAnalysis = shouldRunFullAnalysis(userMessage);
    store.addMessage({
      id: '',
      role: 'assistant',
      content: runFullAnalysis ? tr.chat.initStatus : '正在读取历史、画布和工程上下文，并进行核准校验...',
      timestamp: 0,
    });

    try {
      // Extract recent conversation history (last 10 non-system messages)
      const storeMessages = useStore.getState().messages;
      const history = storeMessages
        .filter(m => m.role !== 'system')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

      const response = runFullAnalysis
        ? await api.analyzeV2SSE(p.id, userMessage, history)
        : await api.chatSSE(p.id, userMessage, history, buildCanvasContext());
      await readStream(response, runFullAnalysis ? 'analysis' : 'chat');
    } catch (error: any) {
      store.addMessage({
        id: '',
        role: 'system',
        content: `${tr.chat.error}: ${error.message}`,
        timestamp: 0,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-5 overflow-hidden min-h-0">
      <div className="flex justify-between items-start mb-4 shrink-0">
        <div>
          <div className="text-xs text-app-text-tertiary font-bold uppercase tracking-[0.2em]">{tr.chat.agent}</div>
          <div className="flex items-center gap-2 mt-2">
            <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
              快速对话
            </span>
            <span className="px-2 py-1 rounded-full bg-app-accent/10 text-app-accent text-[10px] font-bold border border-indigo-500/20">
              LangGraph 生成
            </span>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <button
            className="hover:text-app-accent transition-colors text-[10px] px-2 py-1 rounded-lg hover:bg-app-accent-light"
            onClick={() => { interruptedRef.current = false; interruptedRef2.current = null; newProject({ preserveCanvas: false }); }}
            title={tr.chat.newProject}
          >
            + 清空画布
          </button>
          <button
            className="hover:text-emerald-400 transition-colors text-[10px] px-2 py-1 rounded-lg hover:bg-emerald-500/10"
            onClick={() => { interruptedRef.current = false; interruptedRef2.current = null; newProject({ preserveCanvas: true }); }}
            title="沿用当前画布继续"
          >
            沿用画布
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
        <div className="mb-3 shrink-0 flex items-center gap-2 bg-app-accent/10 border border-indigo-500/20 rounded-xl px-3 py-2 text-[11px]">
          <span className="text-app-accent font-bold">{tr.chat.linkedContext}</span>
          <span className="text-app-text-secondary">
            {chatContext.nodeIds.length} {tr.chat.components}
          </span>
          <button
            className="ml-auto text-app-text-tertiary hover:text-app-text-secondary"
            onClick={() => setChatContext(null)}
          >
            ×
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
        {messages.length === 0 && (
          <div className="mt-8 px-2">
            <div className="text-center text-app-text-secondary text-lg font-bold">{tr.chat.welcome}</div>
            <div className="text-center text-app-text-tertiary text-xs mt-3">{tr.chat.example}</div>
            <div className="grid grid-cols-1 gap-2 mt-6">
              {[
                '基于当前画布检查供电与安全回路',
                '设计一套带急停和两台电机的输送线控制系统',
                '帮我审查 BOM 是否缺少必要附件',
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setInputValue(prompt)}
                  className="text-left rounded-2xl border border-app-border bg-app-bg-primary/60 hover:bg-app-bg-tertiary px-4 py-3 text-xs text-app-text-secondary transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
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
                    ? 'bg-app-accent text-app-text-primary animate-pulse shadow-[0_0_15px_rgba(99,102,241,0.5)]'
                    : 'bg-app-accent/20 text-app-accent'
                }`}
              >
                V
              </div>
            )}
            <div
              className={`max-w-[92%] p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-app-accent text-app-text-primary rounded-tr-sm font-medium ml-8 shadow-lg shadow-indigo-950/30'
                  : msg.role === 'system'
                    ? 'bg-amber-500/10 text-amber-200 rounded-tl-sm text-xs mr-8 border border-amber-500/20'
                    : 'bg-app-bg-tertiary text-app-text-primary rounded-tl-sm text-sm mr-8 shadow-inner border border-app-border/50'
              }`}
            >
              {msg.context?.componentSummary && (
                <div className="mb-2 rounded-lg bg-app-accent/10 border border-indigo-500/20 px-2 py-1 text-[10px] text-app-accent">
                  关联画布: {msg.context.componentSummary}
                </div>
              )}
              {msg.content}
              {msg.role === 'assistant' && msg.options && msg.options.length > 0 && (
                <ClarifyCard
                  groups={msg.options}
                  onSelect={(key, choice) =>
                    setInputValue((prev) =>
                      prev ? `${prev}\n${key}=${choice}` : `${key}=${choice}`
                    )
                  }
                />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="mt-5 shrink-0 rounded-3xl bg-app-bg-primary border border-app-border p-2 shadow-2xl">
        <textarea
          id="chat-input"
          name="chat-input"
          rows={3}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={isProcessing ? tr.chat.processing : tr.chat.placeholder}
          disabled={isProcessing}
          className="w-full resize-none bg-transparent px-3 py-2 text-sm text-app-text-primary focus:outline-none font-medium placeholder:text-app-text-tertiary disabled:opacity-50"
        />
        <div className="flex items-center justify-between border-t border-app-border pt-2 px-1">
          <div className="text-[10px] text-app-text-tertiary">
            Enter 发送 · Shift+Enter 换行 · 输出前自动核准
          </div>
          <button
            onClick={handleSend}
            disabled={isProcessing || !inputValue.trim()}
            className="bg-app-accent hover:bg-app-accent-hover disabled:bg-app-bg-tertiary disabled:text-app-text-tertiary text-app-text-primary font-bold text-xs px-5 py-2 rounded-xl transition-colors"
          >
            {isProcessing ? '处理中' : tr.chat.send}
          </button>
        </div>
      </div>
    </div>
  );
}
