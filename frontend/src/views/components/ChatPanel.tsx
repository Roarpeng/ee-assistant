import { useState, useRef, useEffect } from 'react';
import { useStore, consumePendingSeedPrompt } from '../../models/store';
import { ClarifyCard } from './ClarifyCard';
import type { NodeData, EdgeData } from '../../models/store';
import { useChatHistory } from '../../hooks/useChatHistory';
import { api } from '../../services/api';
import { t } from '../../services/i18n';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import SendIcon from '@mui/icons-material/Send';
import DeleteIcon from '@mui/icons-material/Delete';
import ChatIcon from '@mui/icons-material/Chat';

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

  // Hero landing => newProject({ seedPrompt }) leaves a one-shot prompt that we
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
  // into the flat shape that our yjsStore + ReactFlow expects.
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
    if (state.clarification?.needed && Array.isArray(state.clarification.groups)) {
      const messages = useStore.getState().messages;
      const lastClarify = [...messages].reverse().find(
        (m) => m.role === 'assistant' && Array.isArray(m.options) && m.options.length > 0
      );
      if (!lastClarify) {
        useStore.getState().addMessage({
          id: '',
          role: 'assistant',
          content: '为了选型更精准,请确认以下参数：',
          options: state.clarification.groups,
          timestamp: 0,
        });
      }
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
          // (BOM, topology, code) that we can render *immediately*.
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

    // Resume flow: human provides manual component selection
    if (interruptedRef.current && p) {
      interruptedRef.current = false;
      let manualSelections: any[];
      try {
        const parsed = JSON.parse(userMessage);
        manualSelections = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // Free-text fallback
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
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', px: 2.5, py: 2.5, overflow: 'hidden', minHeight: 0 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexShrink: 0 }}>
        <Box>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
            {tr.chat.agent}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Chip
              label="快速对话"
              size="small"
              sx={{
                bgcolor: 'rgba(16,185,129,0.1)',
                color: '#34D399',
                border: '1px solid rgba(16,185,129,0.2)',
                fontWeight: 700,
                fontSize: '0.625rem',
                height: 22,
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
            <Chip
              label="LangGraph 生成"
              size="small"
              sx={{
                bgcolor: 'rgba(129,140,248,0.1)',
                color: 'primary.light',
                border: '1px solid rgba(129,140,248,0.2)',
                fontWeight: 700,
                fontSize: '0.625rem',
                height: 22,
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Button
            size="small"
            onClick={() => { interruptedRef.current = false; interruptedRef2.current = null; newProject({ preserveCanvas: false }); }}
            title={tr.chat.newProject}
            sx={{ fontSize: '0.625rem', minWidth: 0, px: 1, py: 0.5, color: 'text.secondary', '&:hover': { color: 'primary.light', bgcolor: 'rgba(129,140,248,0.08)' } }}
          >
            + {tr.chat.newProject}
          </Button>
          <Button
            size="small"
            onClick={() => { interruptedRef.current = false; interruptedRef2.current = null; newProject({ preserveCanvas: true }); }}
            title="沿用当前画布继续"
            sx={{ fontSize: '0.625rem', minWidth: 0, px: 1, py: 0.5, color: 'text.secondary', '&:hover': { color: '#34D399', bgcolor: 'rgba(16,185,129,0.08)' } }}
          >
            沿用画布
          </Button>
          <Button
            size="small"
            onClick={clearChat}
            title={tr.chat.clearChat}
            startIcon={<DeleteIcon sx={{ fontSize: 13 }} />}
            sx={{ fontSize: '0.625rem', minWidth: 0, px: 1, py: 0.5, color: 'text.secondary', '&:hover': { color: '#FBBF24', bgcolor: 'rgba(251,191,36,0.08)' } }}
          >
            {tr.chat.clearChat}
          </Button>
        </Box>
      </Box>

      {/* Chat context link banner */}
      {chatContext && (
        <Box
          sx={{
            mb: 1.5,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'rgba(129,140,248,0.1)',
            border: '1px solid rgba(129,140,248,0.2)',
            borderRadius: 3,
            px: 1.5,
            py: 1,
            fontSize: '0.6875rem',
          }}
        >
          <Typography component="span" sx={{ color: 'primary.light', fontWeight: 700 }}>{tr.chat.linkedContext}</Typography>
          <Typography component="span" sx={{ color: 'text.secondary' }}>
            {chatContext.nodeIds.length} {tr.chat.components}
          </Typography>
          <Box
            component="button"
            onClick={() => setChatContext(null)}
            sx={{
              ml: 'auto',
              color: 'text.disabled',
              bgcolor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1rem',
              lineHeight: 1,
              '&:hover': { color: 'text.secondary' },
            }}
          >
            ×
          </Box>
        </Box>
      )}

      {/* Messages area */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          pr: 1,
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 3, minHeight: 40 },
        }}
      >
        {messages.length === 0 && (
          <Box sx={{ mt: 4, px: 1 }}>
            <Typography sx={{ textAlign: 'center', color: 'text.secondary', fontWeight: 700, fontSize: '1.125rem' }}>
              {tr.chat.welcome}
            </Typography>
            <Typography sx={{ textAlign: 'center', color: 'text.disabled', fontSize: '0.75rem', mt: 1.5 }}>
              {tr.chat.example}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1, mt: 3 }}>
              {[
                '基于当前画布检查供电与安全回路',
                '设计一套带急停和两台电机的输送线控制系统',
                '帮我审查 BOM 是否缺少必要附件',
              ].map((prompt) => (
                <Paper
                  key={prompt}
                  onClick={() => setInputValue(prompt)}
                  variant="outlined"
                  sx={{
                    textAlign: 'left',
                    borderRadius: 4,
                    borderColor: 'divider',
                    bgcolor: 'rgba(15,23,42,0.6)',
                    px: 2,
                    py: 1.5,
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    '&:hover': { bgcolor: 'background.paper' },
                  }}
                >
                  {prompt}
                </Paper>
              ))}
            </Box>
          </Box>
        )}
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isSystem = msg.role === 'system';

          const bubbleSx = isUser
            ? {
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                borderColor: 'transparent',
                borderTopRightRadius: '4px',
                fontWeight: 500,
                boxShadow: '0 10px 15px -3px rgba(30,27,75,0.3)',
              }
            : isSystem
            ? {
                bgcolor: 'rgba(245,158,11,0.1)',
                color: '#FDE68A',
                borderColor: 'rgba(245,158,11,0.2)',
                borderTopLeftRadius: '4px',
                fontSize: '0.75rem',
              }
            : {
                bgcolor: 'background.paper',
                color: 'text.primary',
                borderColor: 'rgba(51,65,85,0.5)',
                borderTopLeftRadius: '4px',
              };

          return (
            <Box
              key={msg.id}
              sx={{ display: 'flex', gap: 1.5, flexDirection: isUser ? 'row-reverse' : 'row' }}
            >
              {!isUser && (
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    flexShrink: 0,
                    mt: 0.5,
                    ...(isProcessing && msg.role === 'assistant'
                      ? {
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          boxShadow: '0 0 15px rgba(99,102,241,0.5)',
                        }
                      : { bgcolor: 'rgba(129,140,248,0.2)', color: 'primary.light' }
                    ),
                  }}
                >
                  <ChatIcon sx={{ fontSize: 16 }} />
                </Box>
              )}
              <Paper
                variant="outlined"
                sx={{
                  maxWidth: '92%',
                  p: 2,
                  fontSize: '0.875rem',
                  lineHeight: 1.625,
                  whiteSpace: 'pre-wrap',
                  ...bubbleSx,
                }}
              >
                {msg.context?.componentSummary && (
                  <Box
                    sx={{
                      mb: 1,
                      borderRadius: 1,
                      bgcolor: 'rgba(129,140,248,0.1)',
                      border: '1px solid rgba(129,140,248,0.2)',
                      px: 1,
                      py: 0.5,
                      fontSize: '0.625rem',
                      color: 'primary.light',
                    }}
                  >
                    关联画布: {msg.context.componentSummary}
                  </Box>
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
              </Paper>
            </Box>
          );
        })}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input area */}
      <Paper
        variant="outlined"
        sx={{
          mt: 2.5,
          flexShrink: 0,
          borderRadius: 4,
          bgcolor: 'background.default',
          borderColor: 'divider',
          p: 1,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        <TextField
          multiline
          minRows={3}
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
          variant="outlined"
          fullWidth
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: 'transparent',
              '& fieldset': { border: 'none' },
            },
            '& .MuiInputBase-input': {
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'text.primary',
              '&::placeholder': { color: 'text.disabled', opacity: 1 },
            },
          }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid', borderColor: 'divider', pt: 1, px: 0.5 }}>
          <Typography sx={{ fontSize: '0.625rem', color: 'text.disabled' }}>
            Enter 发送 · Shift+Enter 换行 · 输出前自动核准
          </Typography>
          <Button
            onClick={handleSend}
            disabled={isProcessing || !inputValue.trim()}
            variant="contained"
            endIcon={isProcessing ? <CircularProgress size={14} color="inherit" /> : <SendIcon sx={{ fontSize: 16 }} />}
            sx={{ fontWeight: 700, fontSize: '0.75rem', px: 2.5, py: 1, minWidth: 0, borderRadius: 3 }}
          >
            {isProcessing ? '处理中' : tr.chat.send}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
