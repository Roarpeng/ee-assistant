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
import type { NodeData } from '../../models/store';
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
import { toPng } from 'html-to-image';

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

export function TopologyPanel() {
  const topology = useStore((s) => s.topology);
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
    const edgeStyle = (protocol: string) => ({
      id: '', source: '', target: '',
      type: 'smoothstep' as const,
      animated: protocol === 'ETHERCAT',
      reconnectable: true,
      style: { stroke: '#737373', strokeWidth: 2 },
      labelStyle: { fill: '#a3a3a3', fontWeight: 700, fontSize: 12 },
      labelBgStyle: { fill: '#171717', fillOpacity: 0.8 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#737373' },
    });

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
        let next = current.filter((e) => snapEdgeIds.has(e.id));

        for (const snap of snapshot.edges) {
          const exists = next.some((e) => e.id === snap.id);
          if (!exists) {
            next.push({
              ...edgeStyle(snap.protocol),
              id: snap.id,
              source: snap.source,
              target: snap.target,
              label: snap.protocol,
            });
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
    } catch (err) {
      console.error('Failed to confirm topology', err);
    } finally {
      setIsSavingTopology(false);
    }
  }, [project, isSavingTopology]);

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

      const id = `e_${source}_${target}_${Date.now()}`;
      const protocol = 'PROFINET';
      const newEdge = {
        ...params,
        id,
        source,
        target,
        type: 'smoothstep' as const,
        label: protocol,
        animated: false,
        reconnectable: true,
        style: { stroke: '#737373', strokeWidth: 2 },
        labelStyle: { fill: '#a3a3a3', fontWeight: 700, fontSize: 12 },
        labelBgStyle: { fill: '#171717', fillOpacity: 0.8 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#737373' },
      };

      // Write to Yjs (CRDT source of truth)
      addUserEdge({ id, source, target, protocol });

      setEdges((eds) => addEdge(newEdge, eds));
      setTimeout(handleSyncToCode, 500);
    },
    [setEdges, handleSyncToCode]
  );

  const handleExportSvg = useCallback(async () => {
    const el = document.querySelector('.react-flow__renderer') as HTMLElement | null;
    if (!el) return;
    try {
      const dataUrl = await toPng(el, { backgroundColor: '#111111', pixelRatio: 2 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `topology-${project?.id?.slice(0, 8) || 'export'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [project?.id]);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      setEdges((els) =>
        els.map((e) => {
          if (e.id !== oldEdge.id) return e;
          return {
            ...e,
            source: newConnection.source || e.source,
            target: newConnection.target || e.target,
            sourceHandle: newConnection.sourceHandle,
            targetHandle: newConnection.targetHandle,
            style: {
              ...(typeof e.style === 'object' ? e.style : {}),
              stroke: '#818cf8',
              strokeWidth: 3,
            },
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

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col p-8 rounded-[2.5rem]">
      <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-indigo-600/20 rounded-full blur-[100px]" />

      <div className="flex justify-between items-center relative z-10 shrink-0 mb-4">
        <div className="flex items-center gap-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
              {tr.topology.active}
            </span>
          </div>
          <div className="flex bg-neutral-800 rounded-xl p-1 gap-1 flex-wrap max-w-[600px]">
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
                className="px-2 py-1.5 text-[11px] font-bold text-neutral-300 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors"
              >
                + {label}
              </button>
            ))}
            <div className="w-px bg-neutral-700 my-1 mx-1" />
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
            className="px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-2xl text-sm font-bold hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {isSavingTopology ? '保存中...' : topologyStatus === 'draft' ? '已保存草稿' : '保存草稿'}
          </button>
          <button
            onClick={handleConfirmTopology}
            disabled={isSavingTopology || !project}
            className={`px-4 py-2.5 border rounded-2xl text-sm font-bold disabled:opacity-50 transition-colors ${
              topologyStatus === 'confirmed'
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
            }`}
          >
            {topologyStatus === 'confirmed' ? '拓扑已确认' : '确认拓扑'}
          </button>
          <button
            onClick={handleSyncToCode}
            disabled={isSyncing || !project}
            className="px-6 py-2.5 bg-indigo-600 border border-indigo-500 rounded-2xl text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-500/20"
          >
            {isSyncing ? tr.topology.syncing : tr.topology.sync}
          </button>
          <button
            onClick={handleExportSvg}
            className="px-6 py-2.5 bg-neutral-800 border border-neutral-700 rounded-2xl text-sm font-bold hover:bg-neutral-700 transition-colors"
          >
            {tr.topology.exportSvg}
          </button>
        </div>
      </div>

      <div className="flex-1 relative z-10 p-0 rounded-3xl overflow-hidden border border-neutral-800/50 bg-[#111111]">
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
          <Controls className="bg-neutral-800 border-neutral-700 fill-neutral-400 text-neutral-400" />
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
    </div>
  );
}
