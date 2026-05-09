import { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
  addEdge,
  Connection,
  Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useStore } from '../../models/store';
import type { NodeData, EdgeData } from '../../models/store';
import { t } from '../../services/i18n';
import { PLCNode, HMINode, IONode, VFDNode, ServoNode, PowerNode, SwitchNode, SafetyRelayNode, SensorNode, IPCNode, SafetyPLCNode, CircuitBreakerNode, ContactorNode, RelayNode, EStopNode, TransformerNode, FuseNode, DisconnectNode } from './CustomNodes';
import { CanvasContextMenu } from './CanvasContextMenu';
import { NodeInfoCard } from './NodeInfoCard';
import { api } from '../../services/api';
import {
  observeTopology,
  updateNodePosition,
  addUserNode,
  removeUserNodes,
  addUserEdge,
  removeUserEdges,
  getTopologySnapshot,
} from '../../models/yjsStore';
import { toSvg } from 'html-to-image';

// ── Electrical-circuit category helpers ─────────────────────────────────
// Color tokens MUST stay in sync with HANDLE_COLOR in CustomNodes.tsx so
// edges visually match the handles they enter/exit.
const CATEGORY_COLORS = {
  power: '#f59e0b',     // amber  — 220V/24V/main supply
  network: '#3b82f6',   // blue   — PROFINET/EtherCAT/Modbus/etc.
  safety: '#ef4444',    // red    — STO/E-stop/safety bus
  feedback: '#10b981',  // green  — sensor/encoder/IO return
  default: '#737373',   // neutral — unknown / mixed
} as const;
type EdgeCategoryKey = keyof typeof CATEGORY_COLORS;

// Mirror of backend `_classify_protocol` so legacy edges (without
// category) still render with the right color.
function classifyProtocol(p?: string): EdgeCategoryKey {
  const s = (p || '').toUpperCase().trim();
  if (!s) return 'default';
  if (/POWER|VOLT|220V|230V|380V|400V|480V|24V|12V|VAC|VDC|MAINS|AC_LINE|DC_LINE/.test(s)) return 'power';
  if (/SAFETY|E-?STOP|EMERGENCY|STO|GUARD|SS1|SS2/.test(s)) return 'safety';
  if (/PROFINET|ETHERCAT|ETHERNET|MODBUS|PROFIBUS|CANOPEN|CAN_BUS|RS485|RS232|OPC|TCP|MQTT|DEVICENET|IO_?LINK/.test(s)) return 'network';
  if (/SIGNAL|FEEDBACK|SENSOR|PULSE|ENCODER|PT100|PT1000|4-20|0-10V|ANALOG|DIGITAL_IO|^DI$|^DO$|^AI$|^AO$/.test(s)) return 'feedback';
  return 'default';
}

// Reverse lookup: which category does a handle ID belong to. Used when the
// user drags an edge — we infer protocol & color from the handle they used.
function handleToCategory(handleId?: string | null): EdgeCategoryKey {
  if (!handleId) return 'default';
  if (handleId.startsWith('pwr-')) return 'power';
  if (handleId.startsWith('net-')) return 'network';
  if (handleId.startsWith('safe-')) return 'safety';
  if (handleId.startsWith('fb-')) return 'feedback';
  return 'default';
}

// Reasonable default protocol label per category — used when the user
// draws an edge themselves.
const CATEGORY_DEFAULT_PROTOCOL: Record<EdgeCategoryKey, string> = {
  power: 'POWER_24V',
  network: 'PROFINET',
  safety: 'SAFETY_CIRCUIT',
  feedback: 'SIGNAL',
  default: 'PROFINET',
};

const nodeTypes = {
  plc: PLCNode,
  hmi: HMINode,
  io: IONode,
  vfd: VFDNode,
  servo: ServoNode,
  power: PowerNode,
  switch: SwitchNode,
  safety_relay: SafetyRelayNode,
  sensor: SensorNode,
  ipc: IPCNode,
  safety_plc: SafetyPLCNode,
  circuit_breaker: CircuitBreakerNode,
  contactor: ContactorNode,
  relay: RelayNode,
  estop: EStopNode,
  transformer: TransformerNode,
  fuse: FuseNode,
  disconnect: DisconnectNode,
};

const NODE_TYPE_TO_BOM: Record<string, string> = {
  plc: 'PLC', safety_plc: '安全PLC', hmi: 'HMI', ipc: 'IPC',
  io: 'IO模块', vfd: '变频器', servo: '伺服驱动器', power: '电源模块',
  switch: '交换机', disconnect: '隔离开关', circuit_breaker: '断路器',
  contactor: '接触器', relay: '继电器', safety_relay: '安全继电器',
  estop: '急停按钮', transformer: '变压器', fuse: '熔断器', sensor: '传感器',
};

export function TopologyPanel() {
  const topology = useStore((s) => s.topology);
  const setBOM = useStore((s) => s.setBOM);
  const setSCLCode = useStore((s) => s.setSCLCode);
  const project = useStore((s) => s.project);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingTopology, setIsSavingTopology] = useState(false);
  const [topologyStatus, setTopologyStatus] = useState<'idle' | 'draft' | 'confirmed'>('idle');
  const language = useStore((s) => s.language);
  const tr = t(language);

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; nodes: NodeData[]; mode: 'single' | 'selection';
  } | null>(null);

  const setPreviewNodeId = useStore((s) => s.setPreviewNodeId);

  const [rfInstance, setRfInstance] = useState<any>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Track which nodes are being dragged to suppress Yjs→ReactFlow position sync
  const draggingNodeIdsRef = useRef<Set<string>>(new Set());

  // Yjs CRDT observer: incrementally syncs topology into ReactFlow local state.
  // Unlike the old Zustand effect, this does NOT replace all nodes — it diffs
  // and preserves user drag positions via the draggingNodeIdsRef guard.
  useEffect(() => {
    // Build a fully-styled ReactFlow edge from a normalized topology edge.
    // - Resolves category from the explicit field, falling back to handle
    //   prefix and finally protocol regex
    // - Picks stroke + marker color from CATEGORY_COLORS
    // - Animates only network edges (rotating dash makes packet flow obvious;
    //   power/safety stay solid because they should look "always on")
    const buildStyledEdge = (snap: EdgeData) => {
      const category: EdgeCategoryKey =
        (snap.category as EdgeCategoryKey | undefined) ||
        handleToCategory(snap.sourceHandle) ||
        classifyProtocol(snap.protocol);
      const color = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.default;
      const isNetwork = category === 'network';
      return {
        id: snap.id,
        source: snap.source,
        target: snap.target,
        sourceHandle: snap.sourceHandle,
        targetHandle: snap.targetHandle,
        type: 'smoothstep' as const,
        animated: isNetwork,
        reconnectable: true,
        label: snap.protocol,
        style: { stroke: color, strokeWidth: 2 },
        labelStyle: { fill: color, fontWeight: 700, fontSize: 11 },
        labelBgStyle: { fill: '#171717', fillOpacity: 0.85 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: { type: MarkerType.ArrowClosed, color },
      };
    };

    const unsub = observeTopology((snapshot) => {
      const draggingIds = draggingNodeIdsRef.current;
      const snapNodeIds = new Set(snapshot.nodes.map((n) => n.id));

      setNodes((current) => {
        // Remove nodes absent from snapshot
        let next = current.filter((n) => snapNodeIds.has(n.id));

        for (const snap of snapshot.nodes) {
          const existingIdx = next.findIndex((n) => n.id === snap.id);
          if (existingIdx < 0) {
            // New node
            next.push({
              id: snap.id,
              type: snap.type,
              position: { x: snap.x, y: snap.y },
              data: { label: snap.label, status: snap.status || 'ok' },
            });
          } else if (!draggingIds.has(snap.id)) {
            // Update type/label/status — x,y preserved if dragging
            const existing = next[existingIdx];
            next[existingIdx] = {
              ...existing,
              type: snap.type,
              data: { ...existing.data, label: snap.label, status: snap.status || 'ok' },
            };
          }
        }
        return next;
      });

      setEdges((current) => {
        const snapEdgeIds = new Set(snapshot.edges.map((e) => e.id));
        const snapById = new Map(snapshot.edges.map((e) => [e.id, e] as const));
        // Drop deleted edges
        let next = current.filter((e) => snapEdgeIds.has(e.id));
        // Update existing — handle/category may have been re-classified
        next = next.map((e) => {
          const snap = snapById.get(e.id);
          if (!snap) return e;
          // If the existing edge already has matching handles, keep ReactFlow's
          // own selection state; otherwise re-build to apply new styling.
          if (
            e.sourceHandle === snap.sourceHandle &&
            e.targetHandle === snap.targetHandle &&
            e.label === snap.protocol
          ) {
            return e;
          }
          return { ...e, ...buildStyledEdge(snap) };
        });
        // Append new edges
        for (const snap of snapshot.edges) {
          if (!next.some((e) => e.id === snap.id)) {
            next.push(buildStyledEdge(snap));
          }
        }
        return next;
      });

      // Keep Zustand in sync for non-ReactFlow subscribers
      useStore.getState().syncTopologyFromYjs();
    });

    return unsub;
  }, [setNodes, setEdges]);

  // Refs to escape stale closures
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  const handleSyncToCode = useCallback(async () => {
    if (isSyncing || !project) return;
    setIsSyncing(true);
    // Read from Yjs snapshot (authoritative source)
    const snapshot = getTopologySnapshot();
    try {
      const data = await api.updateCodeFromTopology(project.id, snapshot);
      if (data.sclCode) setSCLCode(data.sclCode);
    } catch (err) {
      console.error('Failed to sync code', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, project, setSCLCode]);

  const handleSaveTopologyDraft = useCallback(async () => {
    if (!project || isSavingTopology) return;
    setIsSavingTopology(true);
    try {
      const snapshot = getTopologySnapshot();
      await api.saveTopology(project.id, snapshot, 'user');
      setTopologyStatus('draft');
    } catch (err) {
      console.error('Failed to save topology draft', err);
    } finally {
      setIsSavingTopology(false);
    }
  }, [project, isSavingTopology]);

  const handleConfirmTopology = useCallback(async () => {
    if (!project || isSavingTopology) return;
    setIsSavingTopology(true);
    try {
      const snapshot = getTopologySnapshot();
      await api.saveTopology(project.id, snapshot, 'user');
      await api.confirmTopology(project.id);
      setTopologyStatus('confirmed');

      // Generate BOM from topology nodes
      const bomItems = snapshot.nodes.map((node, idx) => ({
        id: String(idx + 1),
        name: node.label || `${NODE_TYPE_TO_BOM[node.type] || node.type} ${node.id.slice(-4)}`,
        mfg: node.details?.manufacturer || '待选型',
        pn: node.details?.partNumber || '',
        qty: 1,
        specs: [
          node.type ? `类型: ${NODE_TYPE_TO_BOM[node.type] || node.type}` : '',
          node.details?.specifications || '',
        ].filter(Boolean).join(', '),
      }));
      setBOM(bomItems);
    } catch (err) {
      console.error('Failed to confirm topology', err);
    } finally {
      setIsSavingTopology(false);
    }
  }, [project, isSavingTopology, setBOM]);

  const addNode = (type: string) => {
    const id = `${type}_${Date.now()}`;
    const x = Math.random() * 200 + 100;
    const y = Math.random() * 200 + 100;
    const label = `New ${type.toUpperCase()}`;

    // Write to Yjs first (CRDT source of truth)
    addUserNode({ id, type, label, x, y, status: 'ok' });

    // Then update ReactFlow local state
    setNodes((nds) =>
      nds.concat({
        id,
        type,
        position: { x, y },
        data: { label, status: 'ok' },
      })
    );
    setTimeout(handleSyncToCode, 500);
  };

  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);

      // Track drag state & persist position to Yjs on drag end
      for (const c of changes) {
        if (c.type === 'position') {
          if (c.dragging) {
            draggingNodeIdsRef.current.add(c.id);
          } else {
            draggingNodeIdsRef.current.delete(c.id);
            const rfNode = nodesRef.current.find((n) => n.id === c.id);
            if (rfNode) {
              updateNodePosition(c.id, rfNode.position.x, rfNode.position.y);
            }
          }
        }
      }

      // Handle structural changes (remove) — sync to Yjs & trigger codegen
      const removedIds = changes
        .filter((c: any) => c.type === 'remove')
        .map((c: any) => c.id);
      if (removedIds.length > 0) {
        removeUserNodes(removedIds);
        setTimeout(handleSyncToCode, 500);
      }

      if (changes.some((c: any) => c.type === 'add')) {
        setTimeout(handleSyncToCode, 500);
      }
    },
    [onNodesChange, handleSyncToCode]
  );

  const handleEdgesChange = useCallback(
    (changes: any) => {
      onEdgesChange(changes);

      const removedIds = changes
        .filter((c: any) => c.type === 'remove')
        .map((c: any) => c.id);
      if (removedIds.length > 0) {
        removeUserEdges(removedIds);
      }

      if (changes.some((c: any) => c.type === 'remove' || c.type === 'add')) {
        setTimeout(handleSyncToCode, 500);
      }
    },
    [onEdgesChange, handleSyncToCode]
  );

  const onConnect = useCallback(
    (params: Edge | Connection) => {
      const source = params.source;
      const target = params.target;
      if (!source || !target) return;

      // Infer category from whichever handle the user grabbed; fall back to
      // network if both handles are unspecified (rare — usually means
      // user dropped on the node body, not a handle).
      const sourceHandle = params.sourceHandle ?? undefined;
      const targetHandle = params.targetHandle ?? undefined;
      const category =
        handleToCategory(sourceHandle) !== 'default'
          ? handleToCategory(sourceHandle)
          : handleToCategory(targetHandle) !== 'default'
          ? handleToCategory(targetHandle)
          : 'network';
      const protocol = CATEGORY_DEFAULT_PROTOCOL[category];
      const color = CATEGORY_COLORS[category];
      const id = `e_${source}_${target}_${Date.now()}`;

      const newEdge = {
        ...params,
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
        type: 'smoothstep' as const,
        label: protocol,
        animated: category === 'network',
        reconnectable: true,
        style: { stroke: color, strokeWidth: 2 },
        labelStyle: { fill: color, fontWeight: 700, fontSize: 11 },
        labelBgStyle: { fill: '#171717', fillOpacity: 0.85 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: { type: MarkerType.ArrowClosed, color },
      };

      // Write to Yjs (CRDT source of truth) with the inferred handle/category.
      // EdgeData.category is the strict 4-value union (no 'default'), so we
      // only persist a category when classification produced a real one.
      addUserEdge({
        id,
        source,
        target,
        protocol,
        sourceHandle,
        targetHandle,
        ...(category !== 'default' ? { category } : {}),
      });

      setEdges((eds) => addEdge(newEdge, eds));
      setTimeout(handleSyncToCode, 500);
    },
    [setEdges, handleSyncToCode]
  );

  const handleExportSvg = useCallback(async () => {
    const el = document.querySelector('.react-flow__renderer') as HTMLElement | null;
    if (!el) return;
    try {
      const dataUrl = await toSvg(el, { backgroundColor: '#111111' });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `topology-${project?.id?.slice(0, 8) || 'export'}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [project?.id]);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      // Re-classify based on the new handle the user dropped on, so the
      // edge keeps matching its electrical category.
      const newCategory = handleToCategory(newConnection.sourceHandle ?? undefined) !== 'default'
        ? handleToCategory(newConnection.sourceHandle ?? undefined)
        : handleToCategory(newConnection.targetHandle ?? undefined);
      const color = newCategory !== 'default' ? CATEGORY_COLORS[newCategory] : undefined;
      setEdges((els) =>
        els.map((e) => {
          if (e.id !== oldEdge.id) return e;
          return {
            ...e,
            source: newConnection.source || e.source,
            target: newConnection.target || e.target,
            sourceHandle: newConnection.sourceHandle,
            targetHandle: newConnection.targetHandle,
            ...(color
              ? {
                  animated: newCategory === 'network',
                  style: { stroke: color, strokeWidth: 2 },
                  labelStyle: { fill: color, fontWeight: 700, fontSize: 11 },
                  markerEnd: { type: MarkerType.ArrowClosed, color },
                }
              : {}),
          };
        })
      );
      setTimeout(handleSyncToCode, 500);
    },
    [setEdges, handleSyncToCode]
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: any) => {
      event.preventDefault();
      const storeData = topology.nodes.find((n) => n.id === node.id);
      const nodeData: NodeData = storeData || {
        id: node.id,
        type: node.type || 'unknown',
        label: node.data?.label || node.type || '',
        x: node.position.x,
        y: node.position.y,
        status: node.data?.status,
      };
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodes: [nodeData],
        mode: 'single',
      });
    },
    [topology.nodes]
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const selected = nodes.filter((n) => n.selected);
      if (selected.length === 0) return;
      const nodeDataList: NodeData[] = selected.map((n) => {
        const storeNode = topology.nodes.find((sn) => sn.id === n.id);
        return storeNode || {
          id: n.id,
          type: n.type || 'unknown',
          label: n.data?.label || n.type || '',
          x: n.position.x,
          y: n.position.y,
        };
      });
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodes: nodeDataList,
        mode: 'selection',
      });
    },
    [nodes, topology.nodes]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: any) => {
      setPreviewNodeId(node.id);
    },
    [setPreviewNodeId]
  );

  const onPaneClick = useCallback(() => {
    setPreviewNodeId(null);
    setContextMenu(null);
  }, [setPreviewNodeId]);

  const hasTopology = topology.nodes.length > 0;

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col p-8 rounded-[2.5rem]">
      <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-app-accent/20 rounded-full blur-[100px]" />

      {!hasTopology ? (
        /* Empty state: direct users to start from chat */
        <div className="flex-1 flex flex-col items-center justify-center relative z-10">
          <div className="w-24 h-24 mb-6 rounded-3xl bg-app-accent/10 border border-indigo-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-app-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-app-text-secondary mb-2">{tr.topology.empty}</h3>
          <p className="text-sm text-app-text-tertiary text-center max-w-xs leading-relaxed">
            {tr.topology.emptyHint}
          </p>
        </div>
      ) : (
        <>
          {/* Toolbar: only visible when topology exists */}
          <div className="flex justify-between items-center relative z-10 shrink-0 mb-4">
            <div className="flex items-center gap-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-app-accent/10 border border-indigo-500/20 rounded-full">
                <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-pulse" />
                <span className="text-[10px] font-bold text-app-accent uppercase tracking-widest">
                  {tr.topology.active}
                </span>
              </div>
              <div className="flex bg-app-bg-tertiary rounded-xl p-1 gap-1 flex-wrap max-w-[600px]">
                {[
                  ['plc', 'PLC'],
                  ['safety_plc', 'SafePLC'],
                  ['hmi', 'HMI'],
                  ['ipc', 'IPC'],
                  ['io', 'IO'],
                  ['vfd', 'VFD'],
                  ['servo', 'Servo'],
                  ['power', 'Power'],
                  ['switch', 'Switch'],
                  ['disconnect', 'Disc.'],
                  ['circuit_breaker', 'CB'],
                  ['contactor', 'Cont.'],
                  ['relay', 'Relay'],
                  ['safety_relay', 'SafeRel'],
                  ['estop', 'E-Stop'],
                  ['transformer', 'Trans.'],
                  ['fuse', 'Fuse'],
                  ['sensor', 'Sensor'],
                ].map(([type, label]) => (
                  <button
                    key={type}
                    onClick={() => addNode(type)}
                    className="px-2 py-1.5 text-[11px] font-bold text-app-text-secondary hover:text-app-text-primary hover:bg-app-bg-tertiary rounded-lg transition-colors"
                  >
                    + {label}
                  </button>
                ))}
                <div className="w-px bg-app-bg-tertiary my-1 mx-1" />
                <button
                  onClick={() => {
                    const nodeRemovals = nodes.filter((n) => n.selected).map((n) => ({ type: 'remove' as const, id: n.id }));
                    const edgeRemovals = edges.filter((e) => e.selected).map((e) => ({ type: 'remove' as const, id: e.id }));
                    if (nodeRemovals.length > 0) handleNodesChange(nodeRemovals);
                    if (edgeRemovals.length > 0) handleEdgesChange(edgeRemovals);
                  }}
                  disabled={!nodes.some((n) => n.selected) && !edges.some((e) => e.selected)}
                  className="px-3 py-1.5 text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-colors"
                >
                  {tr.topology.delete}
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSaveTopologyDraft}
                disabled={isSavingTopology || !project}
                className="px-4 py-2.5 bg-app-bg-tertiary border border-app-border rounded-2xl text-sm font-bold hover:bg-app-bg-tertiary disabled:opacity-50 transition-colors"
              >
                {isSavingTopology ? '保存中...' : topologyStatus === 'draft' ? '已保存草稿' : '保存草稿'}
              </button>
              <button
                onClick={handleConfirmTopology}
                disabled={isSavingTopology || !project}
                className={`px-4 py-2.5 border rounded-2xl text-sm font-bold disabled:opacity-50 transition-colors ${
                  topologyStatus === 'confirmed'
                    ? 'bg-emerald-600 border-emerald-500 text-app-text-primary'
                    : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
                }`}
              >
                {topologyStatus === 'confirmed' ? '拓扑已确认' : '确认拓扑'}
              </button>
              <button
                onClick={handleSyncToCode}
                disabled={isSyncing || !project}
                className="px-6 py-2.5 bg-app-accent border border-indigo-500 rounded-2xl text-sm font-bold text-app-text-primary hover:bg-app-accent-hover disabled:opacity-50 transition-colors shadow-lg shadow-indigo-500/20"
              >
                {isSyncing ? tr.topology.syncing : tr.topology.sync}
              </button>
              <button
                onClick={handleExportSvg}
                className="px-6 py-2.5 bg-app-bg-tertiary border border-app-border rounded-2xl text-sm font-bold hover:bg-app-bg-tertiary transition-colors"
              >
                {tr.topology.exportSvg}
              </button>
            </div>
          </div>

          <div className="flex-1 relative z-10 p-0 rounded-3xl overflow-hidden border border-app-border/50 bg-app-bg-primary">
            <ReactFlow
              key={`rf-${project?.id || 'default'}`}
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onReconnect={onReconnect}
              onNodeContextMenu={onNodeContextMenu}
              onPaneContextMenu={onPaneContextMenu}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onInit={setRfInstance}
              nodeTypes={nodeTypes}
              fitView
              deleteKeyCode={['Backspace', 'Delete']}
              selectNodesOnDrag={false}
              connectionLineStyle={{ stroke: '#818cf8', strokeWidth: 2, strokeDasharray: '6 3' }}
              defaultEdgeOptions={{
                type: 'smoothstep',
                style: { stroke: '#737373', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#737373' },
              }}
              attributionPosition="bottom-right"
              className="react-flow-dark"
            >
              <Background color="#525252" variant={BackgroundVariant.Dots} gap={24} size={2} />
              <Controls className="bg-app-bg-tertiary border-app-border fill-app-text-secondary text-app-text-secondary" />
            </ReactFlow>
            {contextMenu && (
              <CanvasContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                nodes={contextMenu.nodes}
                mode={contextMenu.mode}
                onDismiss={() => setContextMenu(null)}
              />
            )}
            <NodeInfoCard />
          </div>
        </>
      )}
    </div>
  );
}
