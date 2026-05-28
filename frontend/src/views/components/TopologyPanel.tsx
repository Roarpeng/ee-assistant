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
import { Box, Paper, Typography, Button, alpha } from '@mui/material';
import { AccountTree as AccountTreeIcon } from '@mui/icons-material';
import { useStore } from '../../models/store';
import type { NodeData, EdgeData } from '../../models/store';
import { t } from '../../services/i18n';
import {
  PLCNode,
  HMINode,
  IONode,
  VFDNode,
  ServoNode,
  PowerNode,
  SwitchNode,
  SafetyRelayNode,
  SensorNode,
  IPCNode,
  SafetyPLCNode,
  CircuitBreakerNode,
  ContactorNode,
  RelayNode,
  EStopNode,
  TransformerNode,
  FuseNode,
  DisconnectNode,
  SafetyDoorNode,
  SignalLightNode,
} from './CustomNodes';
import { CanvasContextMenu } from './CanvasContextMenu';
import { NodeInfoCard } from './NodeInfoCard';
import { IOBudgetBar } from './IOBudgetBar';
import { computeIOBudget } from '../../services/budget';
import { api } from '../../services/api';
import { postEditFeedback } from '../../services/feedback';
import {
  observeTopology,
  updateNodePosition,
  addUserNode,
  removeUserNodes,
  addUserEdge,
  removeUserEdges,
  getTopologySnapshot,
  updateTopologyLayout,
} from '../../models/yjsStore';
import { toSvg } from 'html-to-image';

// ── Electrical-circuit category helpers ─────────────────────────────────
// Color tokens MUST stay in sync with HANDLE_COLOR in CustomNodes.tsx so
// edges visually match the handles they enter/exit.
const CATEGORY_COLORS = {
  power: '#f59e0b', // amber  — 220V/24V/main supply
  network: '#3b82f6', // blue   — PROFINET/EtherCAT/Modbus/etc.
  safety: '#ef4444', // red    — STO/E-stop/safety bus
  feedback: '#10b981', // green  — sensor/encoder/IO return
  default: '#737373', // neutral — unknown / mixed
} as const;
type EdgeCategoryKey = keyof typeof CATEGORY_COLORS;

// Mirror of backend `_classify_protocol` so legacy edges (without
// category) still render with the right color.
function classifyProtocol(p?: string): EdgeCategoryKey {
  const s = (p || '').toUpperCase().trim();
  if (!s) return 'default';
  if (/POWER|VOLT|220V|230V|380V|400V|480V|24V|12V|VAC|VDC|MAINS|AC_LINE|DC_LINE/.test(s)) return 'power';
  if (/SAFETY|E-?STOP|EMERGENCY|STO|GUARD|SS1|SS2/.test(s)) return 'safety';
  if (/PROFINET|ETHERCAT|ETHERNET|MODBUS|PROFIBUS|CANOPEN|CAN_BUS|RS485|RS232|OPC|TCP|MQTT|DEVICENET|IO_?LINK/.test(s))
    return 'network';
  if (/SIGNAL|FEEDBACK|SENSOR|PULSE|ENCODER|PT100|PT1000|4-20|0-10V|ANALOG|DIGITAL_IO|^DI$|^DO$|^AI$|^AO$/.test(s))
    return 'feedback';
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
  if (handleId.startsWith('wired-')) return 'feedback';
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
  safety_door: SafetyDoorNode,
  signal_light: SignalLightNode,
  indicator_light: SignalLightNode,
};

const NODE_TYPE_TO_BOM: Record<string, string> = {
  plc: 'PLC',
  safety_plc: '安全PLC',
  hmi: 'HMI',
  ipc: 'IPC',
  io: 'IO模块',
  vfd: '变频器',
  servo: '伺服驱动器',
  power: '电源模块',
  switch: '交换机',
  disconnect: '隔离开关',
  circuit_breaker: '断路器',
  contactor: '接触器',
  relay: '继电器',
  safety_relay: '安全继电器',
  estop: '急停按钮',
  transformer: '变压器',
  fuse: '熔断器',
  sensor: '传感器',
  safety_door: '安全门',
  signal_light: '信号灯',
  indicator_light: '指示灯',
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
    x: number;
    y: number;
    nodes: NodeData[];
    mode: 'single' | 'selection';
  } | null>(null);

  const setPreviewNodeId = useStore((s) => s.setPreviewNodeId);
  const budgetItems = useStore((s) => s.budgetItems);
  const budget = computeIOBudget(budgetItems);

  const [rfInstance, setRfInstance] = useState<any>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Track which nodes are being dragged to suppress Yjs→ReactFlow position sync
  const draggingNodeIdsRef = useRef<Set<string>>(new Set());
  // M2 memory-flywheel: capture each node's pre-drag position so we can
  // emit a `topology_edit` decision with a meaningful before/after pair
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Ref container to avoid block-scoped variable 'handleAutoGravityLayout' used before its declaration errors.
  const handleAutoGravityLayoutRef = useRef<() => void>(() => {});

  // Yjs CRDT observer: incrementally syncs topology into ReactFlow local state.
  useEffect(() => {
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
        let next = current.filter((n) => snapNodeIds.has(n.id));
        for (const snap of snapshot.nodes) {
          const existingIdx = next.findIndex((n) => n.id === snap.id);
          if (existingIdx < 0) {
            next.push({
              id: snap.id,
              type: snap.type,
              position: { x: snap.x, y: snap.y },
              data: { label: snap.label, status: snap.status || 'ok' },
            });
          } else if (!draggingIds.has(snap.id)) {
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
        let next = current.filter((e) => snapEdgeIds.has(e.id));
        next = next.map((e) => {
          const snap = snapById.get(e.id);
          if (!snap) return e;
          if (
            e.sourceHandle === snap.sourceHandle &&
            e.targetHandle === snap.targetHandle &&
            e.label === snap.protocol
          ) {
            return e;
          }
          return { ...e, ...buildStyledEdge(snap) };
        });
        for (const snap of snapshot.edges) {
          if (!next.some((e) => e.id === snap.id)) {
            next.push(buildStyledEdge(snap));
          }
        }
        return next;
      });

      useStore.getState().syncTopologyFromYjs();

      // ─── 自动重力规整检测 (5层工业对齐) ───
      if (draggingIds.size === 0 && snapshot.nodes.length > 0) {
        const nodeLayers = snapshot.nodes.map((n) => {
          const type = String(n.type ?? '').toLowerCase();
          let layer = 3; // 默认 Layer 3 Execution

          if (type === 'power' || type === 'transformer') {
            layer = 0;
          } else if (
            type === 'circuit_breaker' || type === 'fuse' || type === 'disconnect' ||
            type === 'estop' || type === 'safety_relay' || type === 'safety_door'
          ) {
            layer = 1;
          } else if (
            type === 'plc' || type === 'safety_plc' || type === 'ipc' ||
            type === 'switch' || type === 'hmi'
          ) {
            layer = 2;
          } else if (
            type === 'vfd' || type === 'servo' || type === 'contactor' ||
            type === 'relay' || type === 'io' || type === 'signal_light' ||
            type === 'indicator_light'
          ) {
            layer = 3;
          } else if (type === 'sensor') {
            layer = 4;
          }
          return { node: n, layer };
        });

        const layerYMap = [60, 160, 300, 460, 600];
        const nodesByLayer: NodeData[][] = [[], [], [], [], []];
        nodeLayers.forEach((item) => {
          nodesByLayer[item.layer].push(item.node);
        });
        nodesByLayer.forEach((arr) => {
          arr.sort((a, b) => a.x - b.x);
        });

        let needsLayout = false;
        const minSpacing = 240;
        
        for (let layerIdx = 0; layerIdx < 5; layerIdx++) {
          const arr = nodesByLayer[layerIdx];
          const N = arr.length;
          if (N === 0) continue;
          const y = layerYMap[layerIdx];
          const layerWidth = (N - 1) * minSpacing;
          const startX = 600 - layerWidth / 2;

          for (let idx = 0; idx < N; idx++) {
            const node = arr[idx];
            const expectedX = N === 1 ? 600 : startX + idx * minSpacing;
            if (Math.abs(node.x - expectedX) > 1 || node.y !== y) {
              needsLayout = true;
              break;
            }
          }
          if (needsLayout) break;
        }

        if (needsLayout) {
          setTimeout(() => {
            handleAutoGravityLayoutRef.current();
          }, 100);
        }
      }
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
    const snapshot = getTopologySnapshot();
    try {
      const data = await api.updateCodeFromTopology(project.id, snapshot);
      if (data.sclCode) setSCLCode(data.sclCode);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('Project must have requirements first')) {
        console.warn('Sync topology skipped: project has no requirements yet.');
      } else {
        console.error('Failed to sync code', err);
      }
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

      const bomItems = snapshot.nodes.map((node, idx) => ({
        id: String(idx + 1),
        name: node.label || `${NODE_TYPE_TO_BOM[node.type] || node.type} ${node.id.slice(-4)}`,
        mfg: node.details?.manufacturer || '待选型',
        pn: node.details?.partNumber || '',
        qty: 1,
        specs: [node.type ? `类型: ${NODE_TYPE_TO_BOM[node.type] || node.type}` : '', node.details?.specifications || '']
          .filter(Boolean)
          .join(', '),
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

    addUserNode({ id, type, label, x, y, status: 'ok' });

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

      for (const c of changes) {
        if (c.type === 'position') {
          if (c.dragging) {
            if (!draggingNodeIdsRef.current.has(c.id)) {
              const startNode = nodesRef.current.find((n) => n.id === c.id);
              if (startNode) {
                dragStartPositionsRef.current.set(c.id, {
                  x: startNode.position.x,
                  y: startNode.position.y,
                });
              }
            }
            draggingNodeIdsRef.current.add(c.id);
          } else {
            draggingNodeIdsRef.current.delete(c.id);
            const rfNode = nodesRef.current.find((n) => n.id === c.id);
            if (rfNode) {
              updateNodePosition(c.id, rfNode.position.x, rfNode.position.y);
              setTimeout(() => {
                handleAutoGravityLayoutRef.current();
              }, 50);

              const before = dragStartPositionsRef.current.get(c.id);
              dragStartPositionsRef.current.delete(c.id);
              if (
                project &&
                before &&
                (before.x !== rfNode.position.x || before.y !== rfNode.position.y)
              ) {
                postEditFeedback(project.id, {
                  target: 'topology',
                  before: { nodeId: c.id, x: before.x, y: before.y },
                  after: { nodeId: c.id, x: rfNode.position.x, y: rfNode.position.y },
                }).catch(() => {
                  /* best-effort */
                });
              }
            }
          }
        }
      }

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
    [onNodesChange, handleSyncToCode, project]
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

  const handleAutoGravityLayout = useCallback(() => {
    try {
      const snap = getTopologySnapshot();
      if (snap.nodes.length === 0) return;

      const nodeLayers: { node: NodeData; layer: number }[] = snap.nodes.map((n) => {
        const type = String(n.type ?? '').toLowerCase();
        let layer = 3; // 默认 Layer 3 Execution

        if (type === 'power' || type === 'transformer') {
          layer = 0;
        } else if (
          type === 'circuit_breaker' || type === 'fuse' || type === 'disconnect' ||
          type === 'estop' || type === 'safety_relay' || type === 'safety_door'
        ) {
          layer = 1;
        } else if (
          type === 'plc' || type === 'safety_plc' || type === 'ipc' ||
          type === 'switch' || type === 'hmi'
        ) {
          layer = 2;
        } else if (
          type === 'vfd' || type === 'servo' || type === 'contactor' ||
          type === 'relay' || type === 'io' || type === 'signal_light' ||
          type === 'indicator_light'
        ) {
          layer = 3;
        } else if (type === 'sensor') {
          layer = 4;
        }
        return { node: n, layer };
      });

      const layerYMap = [60, 160, 300, 460, 600];
      const nodesByLayer: NodeData[][] = [[], [], [], [], []];
      
      nodeLayers.forEach((item) => {
        nodesByLayer[item.layer].push(item.node);
      });
      
      nodesByLayer.forEach((arr) => {
        arr.sort((a, b) => a.x - b.x);
      });

      const updatedNodes: { id: string; x: number; y: number }[] = [];
      const updatedPositions = new Map<string, { x: number; y: number }>();

      const minSpacing = 240;

      nodesByLayer.forEach((arr, layerIdx) => {
        const N = arr.length;
        if (N === 0) return;
        const y = layerYMap[layerIdx];
        const layerWidth = (N - 1) * minSpacing;
        const startX = 600 - layerWidth / 2;

        arr.forEach((node, idx) => {
          const x = N === 1 ? 600 : startX + idx * minSpacing;
          updatedNodes.push({ id: node.id, x, y });
          updatedPositions.set(node.id, { x, y });
        });
      });

      const updatedEdges: { id: string; sourceHandle?: string; targetHandle?: string }[] = [];

      snap.edges.forEach((edge) => {
        const sourcePos = updatedPositions.get(edge.source);
        const targetPos = updatedPositions.get(edge.target);
        if (!sourcePos || !targetPos) return;

        const category =
          edge.category === 'power' || edge.category === 'network' ||
          edge.category === 'safety' || edge.category === 'feedback'
            ? edge.category
            : handleToCategory(edge.sourceHandle) !== 'default'
              ? handleToCategory(edge.sourceHandle)
              : handleToCategory(edge.targetHandle) !== 'default'
                ? handleToCategory(edge.targetHandle)
                : classifyProtocol(edge.protocol);

        let sourceHandle: string | undefined;
        let targetHandle: string | undefined;

        if (category === 'power') {
          sourceHandle = 'pwr-src';
          targetHandle = 'pwr-tgt';
        } else if (category === 'network') {
          sourceHandle = 'net-src';
          targetHandle = 'net-tgt';
        } else {
          sourceHandle = 'wired-src';
          targetHandle = 'wired-tgt';
        }

        updatedEdges.push({ id: edge.id, sourceHandle, targetHandle });
      });

      updateTopologyLayout(updatedNodes, updatedEdges);
      setTimeout(handleSyncToCode, 500);
    } catch (err) {
      console.error('Failed to align auto-gravity layout:', err);
    }
  }, [handleSyncToCode]);

  handleAutoGravityLayoutRef.current = handleAutoGravityLayout;

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      const newCategory =
        handleToCategory(newConnection.sourceHandle ?? undefined) !== 'default'
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

  const NODE_PALETTE = [
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
  ] as const;

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        p: 4,
        borderRadius: 5,
      }}
    >
      {/* Decorative blur */}
      <Box
        sx={(theme) => ({
          position: 'absolute',
          right: -80,
          bottom: -80,
          width: 320,
          height: 320,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          borderRadius: '50%',
          filter: 'blur(100px)',
          pointerEvents: 'none',
        })}
      />

      {!hasTopology ? (
        /* Empty state: direct users to start from chat */
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            zIndex: 10,
          }}
        >
          <Box
            sx={(theme) => ({
              width: 96,
              height: 96,
              mb: 4,
              borderRadius: 3,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              border: 1,
              borderColor: alpha(theme.palette.primary.main, 0.2),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <AccountTreeIcon
              sx={(theme) => ({
                fontSize: 40,
                color: theme.palette.primary.main,
              })}
            />
          </Box>
          <Typography
            variant="titleLarge"
            sx={{ color: 'text.secondary', mb: 1, fontWeight: 700 }}
          >
            {tr.topology.empty}
          </Typography>
          <Typography
            variant="bodyMedium"
            color="text.disabled"
            sx={{ textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}
          >
            {tr.topology.emptyHint}
          </Typography>
        </Box>
      ) : (
        <>
          {/* Toolbar: only visible when topology exists */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              position: 'relative',
              zIndex: 10,
              flexShrink: 0,
              mb: 2,
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              {/* Status badge */}
              <Box
                sx={(theme) => ({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 0.5,
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  border: 1,
                  borderColor: alpha(theme.palette.primary.main, 0.2),
                  borderRadius: 999,
                })}
              >
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: 'primary.light',
                    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    '@keyframes pulse': {
                      '0%, 100%': { opacity: 1 },
                      '50%': { opacity: 0.4 },
                    },
                  }}
                />
                <Typography
                  variant="labelSmall"
                  sx={{
                    color: 'primary.light',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  {tr.topology.active}
                </Typography>
              </Box>

              {/* Node palette */}
              <Box
                sx={(theme) => ({
                  display: 'flex',
                  bgcolor: theme.palette.surfaceContainer || alpha(theme.palette.common.white, 0.05),
                  borderRadius: 2,
                  p: 0.5,
                  gap: 0.5,
                  flexWrap: 'wrap',
                  maxWidth: 600,
                })}
              >
                {NODE_PALETTE.map(([type, label]) => (
                  <Button
                    key={type}
                    size="small"
                    onClick={() => addNode(type)}
                    sx={{
                      px: 1,
                      py: 0.5,
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'text.secondary',
                      minWidth: 0,
                      lineHeight: 1.4,
                      borderRadius: 1,
                      textTransform: 'none',
                      '&:hover': {
                        color: 'text.primary',
                        bgcolor: 'action.hover',
                      },
                    }}
                  >
                    + {label}
                  </Button>
                ))}
                <Box
                  sx={{
                    width: 1,
                    my: 0.5,
                    mx: 0.5,
                    bgcolor: 'divider',
                  }}
                />
                <Button
                  size="small"
                  onClick={() => {
                    const nodeRemovals = nodes.filter((n) => n.selected).map((n) => ({ type: 'remove' as const, id: n.id }));
                    const edgeRemovals = edges.filter((e) => e.selected).map((e) => ({ type: 'remove' as const, id: e.id }));
                    if (nodeRemovals.length > 0) handleNodesChange(nodeRemovals);
                    if (edgeRemovals.length > 0) handleEdgesChange(edgeRemovals);
                  }}
                  disabled={!nodes.some((n) => n.selected) && !edges.some((e) => e.selected)}
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#f87171',
                    minWidth: 0,
                    lineHeight: 1.4,
                    borderRadius: 1,
                    textTransform: 'none',
                    '&:hover': {
                      color: '#fca5a5',
                      bgcolor: 'rgba(244,63,94,0.2)',
                    },
                    '&.Mui-disabled': {
                      opacity: 0.3,
                    },
                  }}
                >
                  {tr.topology.delete}
                </Button>
              </Box>
            </Box>

            {/* Action buttons */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleSaveTopologyDraft}
                disabled={isSavingTopology || !project}
                sx={{
                  borderRadius: 4,
                  fontWeight: 700,
                  fontSize: 13,
                  borderColor: 'divider',
                  color: 'text.secondary',
                }}
              >
                {isSavingTopology ? '保存中...' : topologyStatus === 'draft' ? '已保存草稿' : '保存草稿'}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={handleConfirmTopology}
                disabled={isSavingTopology || !project}
                sx={{
                  borderRadius: 4,
                  fontWeight: 700,
                  fontSize: 13,
                  ...(topologyStatus === 'confirmed'
                    ? {
                        bgcolor: '#059669',
                        borderColor: '#10b981',
                        color: 'text.primary',
                        '&:hover': { bgcolor: '#047857' },
                      }
                    : {
                        bgcolor: 'rgba(16,185,129,0.1)',
                        borderColor: 'rgba(16,185,129,0.4)',
                        color: '#6ee7b7',
                        '&:hover': { bgcolor: 'rgba(16,185,129,0.2)' },
                      }),
                }}
              >
                {topologyStatus === 'confirmed' ? '拓扑已确认' : '确认拓扑'}
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={handleSyncToCode}
                disabled={isSyncing || !project}
                sx={{
                  borderRadius: 4,
                  fontWeight: 700,
                  fontSize: 13,
                  boxShadow: '0 4px 14px rgba(99,102,241,0.2)',
                }}
              >
                {isSyncing ? tr.topology.syncing : tr.topology.sync}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={handleExportSvg}
                sx={{
                  borderRadius: 4,
                  fontWeight: 700,
                  fontSize: 13,
                  borderColor: 'divider',
                }}
              >
                {tr.topology.exportSvg}
              </Button>
            </Box>
          </Box>

          {/* ReactFlow Canvas */}
          <Paper
            variant="outlined"
            sx={(theme) => ({
              flex: 1,
              position: 'relative',
              zIndex: 10,
              borderRadius: 3,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.black, 0.2) : alpha(theme.palette.common.white, 0.5),
            })}
          >
            <IOBudgetBar budget={budget} />
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
              <Background
                color="#334155"
                variant={BackgroundVariant.Dots}
                gap={24}
                size={2}
              />
              <Controls
                showZoom
                showFitView
                showInteractive
                style={{
                  background: 'transparent',
                  border: 'none',
                }}
                className="react-flow__controls-dark"
              />
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
          </Paper>
        </>
      )}
    </Box>
  );
}
