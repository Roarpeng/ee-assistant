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
  const setStoreTopology = useStore((s) => s.setTopology);
  const setSCLCode = useStore((s) => s.setSCLCode);
  const project = useStore((s) => s.project);
  const [isSyncing, setIsSyncing] = useState(false);
  const language = useStore((s) => s.language);
  const tr = t(language);

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; nodes: NodeData[]; mode: 'single' | 'selection';
  } | null>(null);

  const setPreviewNodeId = useStore((s) => s.setPreviewNodeId);

  const [rfInstance, setRfInstance] = useState<any>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Sync from store when AI updates topology
  useEffect(() => {
    if (!topology.nodes || topology.nodes.length === 0) return;
    if (topology.source !== 'ai') return;

    console.log('TopologyPanel: AI data detected, updating local state...', topology.nodes.length);
    
    const newNodes = topology.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.x, y: node.y },
      data: { label: node.label, status: node.status || 'ok' },
    }));

    const newEdges = topology.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.protocol,
      type: 'smoothstep' as const,
      animated: edge.protocol === 'ETHERCAT',
      reconnectable: true,
      style: { stroke: '#737373', strokeWidth: 2 },
      labelStyle: { fill: '#a3a3a3', fontWeight: 700, fontSize: 12 },
      labelBgStyle: { fill: '#171717', fillOpacity: 0.8 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#737373' },
    }));

    setNodes(newNodes);
    setEdges(newEdges);

    if (rfInstance) {
      setTimeout(() => rfInstance.fitView({ padding: 0.2 }), 100);
    }
  }, [topology, rfInstance, setNodes, setEdges]);

  // Refs to escape stale closures
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  const mapToStoreFormat = useCallback(() => {
    return {
      nodes: nodesRef.current.map((n) => ({
        id: n.id,
        type: n.type || 'unknown',
        label: n.data.label,
        x: n.position.x,
        y: n.position.y,
      })),
      edges: edgesRef.current.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        protocol: (e.label as string) || 'PROFINET',
      })),
    };
  }, []);

  const handleSyncToCode = useCallback(async () => {
    if (isSyncing || !project) return;
    setIsSyncing(true);
    const mapped = mapToStoreFormat();
    setStoreTopology(mapped.nodes, mapped.edges);
    try {
      const data = await api.updateCodeFromTopology(project.id, { nodes: mapped.nodes, edges: mapped.edges });
      if (data.sclCode) setSCLCode(data.sclCode);
    } catch (err) {
      console.error('Failed to sync code', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, project, mapToStoreFormat, setStoreTopology, setSCLCode]);

  const addNode = (type: string) => {
    const newNode = {
      id: `${type}_${Date.now()}`,
      type,
      position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      data: { label: `New ${type.toUpperCase()}`, status: 'ok' as const },
    };
    setNodes((nds) => nds.concat(newNode));
    setTimeout(handleSyncToCode, 500);
  };

  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      setTimeout(() => {
        const mapped = mapToStoreFormat();
        setStoreTopology(mapped.nodes, mapped.edges, 'user');
      }, 50);
      if (changes.some((c: any) => c.type === 'remove' || c.type === 'add')) {
        setTimeout(handleSyncToCode, 500);
      }
    },
    [onNodesChange, handleSyncToCode, mapToStoreFormat, setStoreTopology]
  );

  const handleEdgesChange = useCallback(
    (changes: any) => {
      onEdgesChange(changes);
      setTimeout(() => {
        const mapped = mapToStoreFormat();
        setStoreTopology(mapped.nodes, mapped.edges, 'user');
      }, 50);
      if (changes.some((c: any) => c.type === 'remove' || c.type === 'add')) {
        setTimeout(handleSyncToCode, 500);
      }
    },
    [onEdgesChange, handleSyncToCode, mapToStoreFormat, setStoreTopology]
  );

  const onConnect = useCallback(
    (params: Edge | Connection) => {
      const newEdge = {
        ...params,
        id: `e_${params.source}_${params.target}_${Date.now()}`,
        type: 'smoothstep' as const,
        label: 'PROFINET',
        animated: false,
        reconnectable: true,
        style: { stroke: '#737373', strokeWidth: 2 },
        labelStyle: { fill: '#a3a3a3', fontWeight: 700, fontSize: 12 },
        labelBgStyle: { fill: '#171717', fillOpacity: 0.8 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#737373' },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      setTimeout(handleSyncToCode, 500);
    },
    [setEdges, handleSyncToCode]
  );

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
            onClick={handleSyncToCode}
            disabled={isSyncing || !project}
            className="px-6 py-2.5 bg-indigo-600 border border-indigo-500 rounded-2xl text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-500/20"
          >
            {isSyncing ? tr.topology.syncing : tr.topology.sync}
          </button>
          <button className="px-6 py-2.5 bg-neutral-800 border border-neutral-700 rounded-2xl text-sm font-bold hover:bg-neutral-700 transition-colors">
            {tr.topology.exportSvg}
          </button>
        </div>
      </div>

      <div className="flex-1 relative z-10 p-0 rounded-3xl overflow-hidden border border-neutral-800/50 bg-[#111111]">
        <ReactFlow
          key={`rf-${topology.nodes.length}-${topology.edges.length}-${topology.source}`}
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
