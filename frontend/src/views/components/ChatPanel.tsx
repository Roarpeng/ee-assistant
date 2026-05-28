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
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import Tooltip from '@mui/material/Tooltip';

import { shouldRunFullAnalysis } from '../../utils/analysisRouting';

export function ChatPanel() {
  const store = useStore();
  const { messages, project, language } = store;
  const tr = t(language);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamStale, setStreamStale] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    
    // 1. 预分配所有节点的层级以完成工业重力排序
    const nodeLayers = new Map<string, { layer: number; index: number }>();
    const layerCounts = [0, 0, 0, 0]; // 4 个层级的节点计数

    nodesIn.forEach((n, i) => {
      if (!n || typeof n !== 'object') return;
      const id = String(n.id ?? `node_${i}`).trim();
      const type = String(n.type ?? '').toLowerCase();
      const data = n.data && typeof n.data === 'object' ? n.data : {};
      const labelRaw = String(n.label ?? data.label ?? '').toLowerCase();

      let layer = 3; // 默认第四层 (现场设备层)
      if (
        type.includes('plc') || type.includes('ipc') ||
        labelRaw.includes('plc') || labelRaw.includes('控制器') || labelRaw.includes('s7-') || labelRaw.includes('1200')
      ) {
        layer = 0; // 第一层：控制决策层
      } else if (
        type.includes('power') || type.includes('switch') ||
        labelRaw.includes('电源') || labelRaw.includes('开关') || labelRaw.includes('交换机') || labelRaw.includes('qf')
      ) {
        layer = 1; // 第二层：配电与辅助层
      } else if (
        type.includes('vfd') || type.includes('servo') || type.includes('contactor') || type.includes('relay') || type.includes('breaker') ||
        labelRaw.includes('继电器') || labelRaw.includes('接触器') || labelRaw.includes('断路器') || labelRaw.includes('驱动器') || labelRaw.includes('变频器') || labelRaw.includes('km')
      ) {
        layer = 2; // 第三层：配电与执行驱动层
      }

      nodeLayers.set(id, { layer, index: layerCounts[layer] });
      layerCounts[layer]++;
    });

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
      
      const layout = nodeLayers.get(id) || { layer: 3, index: i };
      const layerYMap = [60, 220, 380, 540]; // 4 个层级在 Y 轴的像素高度

      const x = Number.isFinite(+n.x) ? +n.x : Number.isFinite(+pos.x) ? +pos.x : 200 + (layout.index * 240);
      const y = Number.isFinite(+n.y) ? +n.y : Number.isFinite(+pos.y) ? +pos.y : layerYMap[layout.layer];

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
      
      let sourceHandle = typeof e.sourceHandle === 'string' ? e.sourceHandle : undefined;
      let targetHandle = typeof e.targetHandle === 'string' ? e.targetHandle : undefined;
      let category =
        e.category === 'power' || e.category === 'network' ||
        e.category === 'safety' || e.category === 'feedback'
          ? e.category
          : undefined;

      try {
        if (!category) {
          const s = protocol.toUpperCase().trim();
          if (/POWER|VOLT|220V|230V|380V|400V|480V|24V|12V|VAC|VDC|MAINS|AC_LINE|DC_LINE/.test(s)) {
            category = 'power';
          } else if (/SAFETY|E-?STOP|EMERGENCY|STO|GUARD|SS1|SS2/.test(s)) {
            category = 'safety';
          } else if (/PROFINET|ETHERCAT|ETHERNET|MODBUS|PROFIBUS|CANOPEN|CAN_BUS|RS485|RS232|OPC|TCP|MQTT|DEVICENET|IO_?LINK/.test(s)) {
            category = 'network';
          } else if (/SIGNAL|FEEDBACK|SENSOR|PULSE|ENCODER|PT100|PT1000|4-20|0-10V|ANALOG|DIGITAL_IO|^DI$|^DO$|^AI$|^AO$/.test(s)) {
            category = 'feedback';
          } else {
            category = 'network';
          }
        }

        if (!sourceHandle || !targetHandle) {
          const sNode = nodes.find((n) => n.id === source);
          const tNode = nodes.find((n) => n.id === target);
          if (sNode && tNode) {
            if (category === 'power') {
              sourceHandle = 'pwr-bottom';
              targetHandle = 'pwr-top';
            } else if (category === 'network') {
              sourceHandle = 'net-right';
              targetHandle = 'net-left';
            } else {
              sourceHandle = 'wired-right';
              targetHandle = 'wired-left';
            }
          }
        }
      } catch (err) {
        console.error('Failed to auto-route edge connection handles:', err);
      }

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
    if (state.mermaid_code || state.schematic?.mermaid_code) {
      useStore.getState().setMermaidCode(state.mermaid_code || state.schematic?.mermaid_code);
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

  const runFullAnalysisForMessage = (message: string) => {
    const userTurns = useStore.getState().messages.filter((m) => m.role === 'user').length;
    const hasCanvas = topology.nodes.length > 0 || bom.length > 0 || Boolean(chatContext);
    return shouldRunFullAnalysis(message, { hasCanvas, userTurns });
  };

  // Heartbeat monitoring: server sends keepalive every 15s. If nothing arrives
  // for 45s, mark stream as potentially stale for visual feedback.
  const resetHeartbeatTimer = () => {
    if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    setStreamStale(false);
    heartbeatTimerRef.current = setTimeout(() => setStreamStale(true), 45_000);
  };
  const clearHeartbeatTimer = () => {
    if (heartbeatTimerRef.current) { clearTimeout(heartbeatTimerRef.current); heartbeatTimerRef.current = null; }
    setStreamStale(false);
  };
  useEffect(() => { return () => clearHeartbeatTimer(); }, []);

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

    resetHeartbeatTimer();

    try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      resetHeartbeatTimer();

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
    } finally {
      clearHeartbeatTimer();
    }
  };

  const dispatchUserMessage = async (
    userMessage: string,
    opts?: { forceFullAnalysis?: boolean },
  ) => {
    if (!userMessage.trim() || isProcessing) return;

    const text = userMessage.trim();
    store.addMessage({ id: '', role: 'user', content: text, timestamp: 0 });

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
        const parsed = JSON.parse(text);
        manualSelections = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // Free-text fallback
        manualSelections = [{
          category: interruptedRef2.current?.not_found_categories?.[0] || '',
          manufacturer: '',
          order_number: text,
          model: text,
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

    const runFullAnalysis =
      opts?.forceFullAnalysis === true || runFullAnalysisForMessage(text);
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
        ? await api.analyzeV2SSE(p.id, text, history)
        : await api.chatSSE(p.id, text, history, buildCanvasContext());
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

  const handleSend = async () => {
    if (!inputValue.trim() || isProcessing) return;
    const userMessage = inputValue.trim();
    setInputValue('');
    await dispatchUserMessage(userMessage);
  };

  const handleFullAnalysis = async () => {
    if (isProcessing) return;
    const userMessage = inputValue.trim() || tr.chat.fullAnalysisDefault;
    setInputValue('');
    await dispatchUserMessage(userMessage, { forceFullAnalysis: true });
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', px: 2.5, py: 2.5, overflow: 'hidden', minHeight: 0 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2.5, flexShrink: 0, borderBottom: '1px solid', borderColor: 'divider', pb: 1.5 }}>
        <Button
          size="small"
          onClick={() => { interruptedRef.current = false; interruptedRef2.current = null; newProject({ preserveCanvas: false }); }}
          title={tr.chat.newProject}
          sx={{
            fontSize: '0.725rem',
            fontWeight: 700,
            textTransform: 'none',
            px: 1.5,
            py: 0.75,
            color: 'text.primary',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '6px',
            bgcolor: 'background.paper',
            '&:hover': { color: 'primary.light', bgcolor: 'rgba(129,140,248,0.08)', borderColor: 'primary.light' }
          }}
        >
          + {tr.chat.newProject}
        </Button>
        <Button
          size="small"
          onClick={() => { interruptedRef.current = false; interruptedRef2.current = null; newProject({ preserveCanvas: true }); }}
          title="沿用当前画布继续"
          sx={{
            fontSize: '0.725rem',
            fontWeight: 700,
            textTransform: 'none',
            px: 1.5,
            py: 0.75,
            color: 'text.primary',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '6px',
            bgcolor: 'background.paper',
            '&:hover': { color: '#34D399', bgcolor: 'rgba(16,185,129,0.08)', borderColor: '#34D399' }
          }}
        >
          沿用画布
        </Button>
        <Button
          size="small"
          onClick={clearChat}
          title={tr.chat.clearChat}
          startIcon={<DeleteIcon sx={{ fontSize: 13 }} />}
          sx={{
            fontSize: '0.725rem',
            fontWeight: 700,
            textTransform: 'none',
            px: 1.5,
            py: 0.75,
            color: 'text.secondary',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '6px',
            bgcolor: 'background.paper',
            ml: 'auto',
            '&:hover': { color: '#FBBF24', bgcolor: 'rgba(251,191,36,0.08)', borderColor: '#FBBF24' }
          }}
        >
          {tr.chat.clearChat}
        </Button>
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
                tr.chat.fullAnalysisDefault,
                '基于当前画布检查供电与安全回路',
                '设计一套带急停和两台电机的输送线控制系统',
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
          borderRadius: '12px',
          bgcolor: 'background.default',
          borderColor: 'divider',
          p: 1.5,
          boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
          '&:focus-within': {
            borderColor: 'primary.light',
            boxShadow: '0 8px 30px rgba(99, 102, 241, 0.15)',
          },
          transition: 'border-color 0.2s, box-shadow 0.2s',
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
              p: 0,
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid', borderColor: 'divider', pt: 1.5, mt: 1, px: 0.5, gap: 1 }}>
          {isProcessing && streamStale ? (
            <Chip
              size="small"
              label="Stream idle 45s..."
              sx={{ fontSize: '0.625rem', height: 20, bgcolor: 'rgba(245,158,11,0.15)', color: '#FBBF24', borderColor: 'rgba(245,158,11,0.3)', '& .MuiChip-label': { px: 1 } }}
            />
          ) : (
            <Typography sx={{ fontSize: '0.625rem', color: 'text.disabled', flex: 1 }}>
              Enter 发送 · Shift+Enter 换行
            </Typography>
          )}
          <Tooltip title={tr.chat.fullAnalysisHint}>
            <span>
              <Button
                onClick={() => void handleFullAnalysis()}
                disabled={isProcessing}
                variant="outlined"
                size="small"
                startIcon={<AutoAwesomeIcon sx={{ fontSize: 16 }} />}
                sx={{
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  textTransform: 'none',
                  borderColor: 'rgba(129,140,248,0.4)',
                  color: 'primary.light',
                  flexShrink: 0,
                }}
              >
                {tr.chat.fullAnalysis}
              </Button>
            </span>
          </Tooltip>
          <Button
            onClick={() => void handleSend()}
            disabled={isProcessing || !inputValue.trim()}
            variant="contained"
            endIcon={isProcessing ? <CircularProgress size={14} color="inherit" /> : <SendIcon sx={{ fontSize: 16 }} />}
            sx={{
              fontWeight: 700,
              fontSize: '0.75rem',
              px: 2.5,
              py: 0.75,
              minWidth: 0,
              borderRadius: '6px',
              textTransform: 'none',
              boxShadow: 'none',
              '&:hover': {
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              }
            }}
          >
            {isProcessing ? '处理中' : tr.chat.send}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
