import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import type { NodeData, EdgeData } from './store';

// Singleton Yjs document — single source of truth for topology
const ydoc = new Y.Doc();

// y-webrtc provider for local multi-tab / future multi-user collaboration.
// In single-user mode, if no peers connect, the CRDT operates locally.
const webrtcProvider = new WebrtcProvider('ele-topology', ydoc, {
  signaling: ['wss://signaling.yjs.dev'],
});
// y-webrtc will attempt P2P; failures are non-fatal (CRDT works locally)

// Shared types: each node/edge is a Y.Map inside a Y.Array
export const yNodes: Y.Array<Y.Map<any>> = ydoc.getArray('nodes');
export const yEdges: Y.Array<Y.Map<any>> = ydoc.getArray('edges');

// ── Serialization helpers ──

function nodeToYMap(node: NodeData): Y.Map<any> {
  const m = new Y.Map();
  m.set('id', node.id);
  m.set('type', node.type);
  m.set('label', node.label);
  m.set('x', node.x);
  m.set('y', node.y);
  if (node.status) m.set('status', node.status);
  if (node.details) {
    const detailsMap = new Y.Map();
    for (const [k, v] of Object.entries(node.details)) {
      detailsMap.set(k, v);
    }
    m.set('details', detailsMap);
  }
  return m;
}

function yMapToNode(m: Y.Map<any>): NodeData {
  const details = m.get('details');
  return {
    id: m.get('id'),
    type: m.get('type'),
    label: m.get('label'),
    x: m.get('x'),
    y: m.get('y'),
    status: m.get('status'),
    ...(details instanceof Y.Map ? { details: Object.fromEntries(details.entries()) } : {}),
  };
}

function edgeToYMap(edge: EdgeData): Y.Map<any> {
  const m = new Y.Map();
  m.set('id', edge.id);
  m.set('source', edge.source);
  m.set('target', edge.target);
  m.set('protocol', edge.protocol);
  return m;
}

function yMapToEdge(m: Y.Map<any>): EdgeData {
  return {
    id: m.get('id'),
    source: m.get('source'),
    target: m.get('target'),
    protocol: m.get('protocol'),
  };
}

// ── AI topology merge (preserves user x,y) ──

export function mergeAITopology(aiNodes: NodeData[], aiEdges: EdgeData[]): void {
  ydoc.transact(() => {
    const aiNodeIds = new Set(aiNodes.map((n) => n.id));

    // Remove nodes no longer in AI result (iterate backwards)
    let i = yNodes.length;
    while (i-- > 0) {
      if (!aiNodeIds.has(yNodes.get(i).get('id'))) {
        yNodes.delete(i);
      }
    }

    // Upsert: new nodes added in full; existing nodes get type/label/status
    // updated but x,y preserved to avoid interrupting user drags.
    for (const aiNode of aiNodes) {
      const idx = yNodes.toArray().findIndex((n) => n.get('id') === aiNode.id);
      if (idx >= 0) {
        const existing = yNodes.get(idx);
        existing.set('type', aiNode.type);
        existing.set('label', aiNode.label);
        if (aiNode.status) existing.set('status', aiNode.status);
        // x, y intentionally NOT set — CRDT merges concurrent user drags
      } else {
        yNodes.push([nodeToYMap(aiNode)]);
      }
    }

    // Edges: full replace (no interactive position state to preserve)
    yEdges.delete(0, yEdges.length);
    yEdges.push(aiEdges.map(edgeToYMap));
  });
}

// ── Single-node position update (called on user drag end) ──

export function updateNodePosition(nodeId: string, x: number, y: number): void {
  const arr = yNodes.toArray();
  const idx = arr.findIndex((n) => n.get('id') === nodeId);
  if (idx >= 0) {
    ydoc.transact(() => {
      yNodes.get(idx).set('x', x);
      yNodes.get(idx).set('y', y);
    });
  }
}

// ── User canvas mutations ──

export function addUserNode(node: NodeData): void {
  yNodes.push([nodeToYMap(node)]);
}

export function removeUserNodes(nodeIds: string[]): void {
  const ids = new Set(nodeIds);
  ydoc.transact(() => {
    let i = yNodes.length;
    while (i-- > 0) {
      if (ids.has(yNodes.get(i).get('id'))) {
        yNodes.delete(i);
      }
    }
  });
}

export function addUserEdge(edge: EdgeData): void {
  yEdges.push([edgeToYMap(edge)]);
}

export function removeUserEdges(edgeIds: string[]): void {
  const ids = new Set(edgeIds);
  ydoc.transact(() => {
    let i = yEdges.length;
    while (i-- > 0) {
      if (ids.has(yEdges.get(i).get('id'))) {
        yEdges.delete(i);
      }
    }
  });
}

// ── Observation (for React Flow incremental sync) ──

export type TopologySnapshot = { nodes: NodeData[]; edges: EdgeData[] };

export function getTopologySnapshot(): TopologySnapshot {
  return {
    nodes: yNodes.toArray().map(yMapToNode),
    edges: yEdges.toArray().map(yMapToEdge),
  };
}

export function observeTopology(callback: (snapshot: TopologySnapshot) => void): () => void {
  const fire = () => callback(getTopologySnapshot());
  yNodes.observe(fire);
  yEdges.observe(fire);
  return () => {
    yNodes.unobserve(fire);
    yEdges.unobserve(fire);
  };
}

// ── Lifecycle ──

export function resetYjsDoc(): void {
  ydoc.transact(() => {
    yNodes.delete(0, yNodes.length);
    yEdges.delete(0, yEdges.length);
  });
}

export function destroyYjsProvider(): void {
  webrtcProvider.destroy();
  ydoc.destroy();
}
