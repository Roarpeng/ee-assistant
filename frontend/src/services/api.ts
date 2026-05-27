import { authedFetch } from './orgClient';
import { toast } from '../models/toastStore';

const BASE = '/api';

function getSettings() {
  try {
    const raw = localStorage.getItem('ee-settings');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    chat: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
    embedding: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small' },
  };
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await authedFetch(`${BASE}${url}`, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    });
  } catch (networkErr) {
    toast.error('Network error — please check your connection');
    throw networkErr;
  }
  if (!res.ok) {
    const err = await res.text();
    const msg = `API ${res.status}: ${err}`;
    if (res.status >= 500) toast.error(msg);
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getSettings,

  // Projects
  createProject: (name: string) =>
    request<{ id: string; name: string }>(`/projects?name=${encodeURIComponent(name)}`, { method: 'POST' }),

  getProject: (id: string) => request<any>(`/projects/${id}`),

  listProjects: () => request<any[]>(`/projects`),

  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),

  saveTopology: (projectId: string, snapshot: { nodes: any[]; edges: any[] }, source = 'user') =>
    request<any>(`/projects/${projectId}/topology`, {
      method: 'POST',
      body: JSON.stringify({ snapshot, source }),
    }),

  confirmTopology: (projectId: string, topologyId?: string) =>
    request<any>(`/projects/${projectId}/topology/confirm`, {
      method: 'POST',
      body: JSON.stringify(topologyId ? { topology_id: topologyId } : {}),
    }),

  // Analysis v1 (fallback)
  analyze: (projectId: string, text: string) => {
    const settings = getSettings();
    return request<any>(`/projects/${projectId}/analyze`, {
      method: 'POST',
      body: JSON.stringify({
        text,
        llm_config: {
          api_key: settings.chat.apiKey,
          base_url: settings.chat.baseUrl,
          model: settings.chat.model,
          max_tokens: settings.chat.maxTokens ?? 4096,
          temperature: settings.chat.temperature ?? 0.1,
          provider: settings.chat.provider,
        },
        embedding_config: {
          api_key: settings.embedding.apiKey,
          base_url: settings.embedding.baseUrl,
          model: settings.embedding.model,
          dimension: settings.embedding.dimension ?? 4096,
          provider: settings.embedding.provider,
        },
      }),
    });
  },

  // Analysis v2 (LangGraph via SSE)
  analyzeV2SSE: (projectId: string, message: string, history: any[] = [], canvasContext: any = {}) => {
    const settings = getSettings();
    return authedFetch(`${BASE}/projects/${projectId}/analyze-v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message,
        history,
        canvas_context: canvasContext,
        llm_config: {
          api_key: settings.chat.apiKey,
          base_url: settings.chat.baseUrl,
          model: settings.chat.model,
          max_tokens: settings.chat.maxTokens ?? 4096,
          temperature: settings.chat.temperature ?? 0.1,
          provider: settings.chat.provider,
        },
        embedding_config: {
          api_key: settings.embedding.apiKey,
          base_url: settings.embedding.baseUrl,
          model: settings.embedding.model,
          dimension: settings.embedding.dimension ?? 4096,
          provider: settings.embedding.provider,
        },
      }),
    });
  },

  // Fast validated conversation agent (keeps current canvas context)
  chatSSE: (
    projectId: string,
    message: string,
    history: any[] = [],
    canvasContext: any = {}
  ) => {
    const settings = getSettings();
    return authedFetch(`${BASE}/projects/${projectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message,
        history,
        canvas_context: canvasContext,
        llm_config: {
          api_key: settings.chat.apiKey,
          base_url: settings.chat.baseUrl,
          model: settings.chat.model,
          max_tokens: settings.chat.maxTokens ?? 4096,
          temperature: settings.chat.temperature ?? 0.1,
          provider: settings.chat.provider,
        },
      }),
    });
  },

  // Resume paused analysis (human selection after NOT_FOUND)
  resumeAnalysis: (projectId: string, manualSelections: any[]) => {
    return authedFetch(`${BASE}/projects/${projectId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manual_selections: manualSelections }),
    });
  },

  // Topology to Code sync
  updateCodeFromTopology: (projectId: string, topology: { nodes: any[]; edges: any[] }) => {
    const settings = getSettings();
    return request<{ sclCode: string }>(`/projects/${projectId}/codegen`, {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        topology,
        llm_config: {
          api_key: settings.chat.apiKey,
          base_url: settings.chat.baseUrl,
          model: settings.chat.model,
          max_tokens: settings.chat.maxTokens ?? 4096,
          temperature: settings.chat.temperature ?? 0.1,
          provider: settings.chat.provider,
        },
      }),
    });
  },

  // Knowledge
  uploadKnowledgeDoc: (formData: FormData) =>
    authedFetch(`${BASE}/knowledge/docs`, { method: 'POST', body: formData }),

  searchKnowledge: (query: string, filters?: { category?: string[]; manufacturer?: string }) => {
    const settings = getSettings();
    return request<any>(`/knowledge/search`, {
      method: 'POST',
      body: JSON.stringify({
        query,
        category_filter: filters?.category,
        manufacturer_filter: filters?.manufacturer,
        top_k: 5,
        embedding_config: {
          api_key: settings.embedding.apiKey,
          base_url: settings.embedding.baseUrl,
          model: settings.embedding.model,
          dimension: settings.embedding.dimension ?? 4096,
          provider: settings.embedding.provider,
        },
      }),
    });
  },

  listKnowledgeDocs: () =>
    request<any[]>(`/knowledge/docs`),

  deleteKnowledgeDoc: (id: string) => request<void>(`/knowledge/docs/${id}`, { method: 'DELETE' }),

  retryKnowledgeDoc: (id: string) => {
    const settings = getSettings();
    return request<any>(`/knowledge/docs/${id}/retry`, {
      method: 'POST',
      body: JSON.stringify({
        llm_config: {
          api_key: settings.chat.apiKey,
          base_url: settings.chat.baseUrl,
          model: settings.chat.model,
          max_tokens: settings.chat.maxTokens ?? 4096,
          temperature: settings.chat.temperature ?? 0.1,
          provider: settings.chat.provider,
        },
        embedding_config: {
          api_key: settings.embedding.apiKey,
          base_url: settings.embedding.baseUrl,
          model: settings.embedding.model,
          dimension: settings.embedding.dimension ?? 4096,
          provider: settings.embedding.provider,
        },
      }),
    });
  },

  deleteKnowledgeDocs: (ids: string[]) =>
    request<{ deleted: number }>(`/knowledge/docs`, {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    }),

  // Single-page URL ingestion. Server fetches the URL, dispatches by
  // Content-Type to the same extractor pipeline as file uploads.
  ingestUrl: (url: string, manufacturer: string = 'Unknown', categoryTags: string[] = []) => {
    const settings = getSettings();
    return request<any>(`/knowledge/urls`, {
      method: 'POST',
      body: JSON.stringify({
        url,
        manufacturer,
        category_tags: categoryTags,
        llm_config: {
          api_key: settings.chat.apiKey,
          base_url: settings.chat.baseUrl,
          model: settings.chat.model,
          max_tokens: settings.chat.maxTokens ?? 4096,
          temperature: settings.chat.temperature ?? 0.1,
          provider: settings.chat.provider,
        },
        embedding_config: {
          api_key: settings.embedding.apiKey,
          base_url: settings.embedding.baseUrl,
          model: settings.embedding.model,
          dimension: settings.embedding.dimension ?? 4096,
          provider: settings.embedding.provider,
        },
      }),
    });
  },

  testConnectivity: (chat: any, embedding: any) =>
    request<{
      chat: { ok: boolean; error?: string; model?: string; provider?: string };
      embedding: {
        ok: boolean;
        error?: string;
        dimension?: number;
        provider?: string;
        sent_dimensions_kwarg?: boolean;
      };
    }>(`/test-connectivity`, {
      method: 'POST',
      body: JSON.stringify({ chat, embedding }),
    }),

  // Chat messages — server-side persistence (M0 Track B). The store
  // calls these so chat history survives a docker restart and is
  // shareable across devices/tabs; localStorage remains as offline cache.
  listMessages: (projectId: string) =>
    request<ServerChatMessage[]>(`/projects/${projectId}/messages`),

  appendMessage: (
    projectId: string,
    msg: { role: string; content: string; options?: unknown },
  ) =>
    request<ServerChatMessage>(`/projects/${projectId}/messages`, {
      method: 'POST',
      body: JSON.stringify(msg),
    }),

  // Component Graph CRUD APIs
  getGraphNodes: (q?: string, componentType?: string) => {
    let url = '/knowledge/graph/nodes';
    const params = [];
    if (q) params.push(`q=${encodeURIComponent(q)}`);
    if (componentType) params.push(`component_type=${encodeURIComponent(componentType)}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    return request<any[]>(url);
  },

  upsertGraphNode: (node: { name: string; component_type: string; properties?: Record<string, any>; source_doc_id?: string }) =>
    request<any>('/knowledge/graph/nodes', {
      method: 'POST',
      body: JSON.stringify(node),
    }),

  deleteGraphNode: (nodeId: string) =>
    request<void>(`/knowledge/graph/nodes/${nodeId}`, { method: 'DELETE' }),

  getGraphEdges: () =>
    request<any[]>('/knowledge/graph/edges'),

  createGraphEdge: (edge: { source_id: string; target_id: string; relation: string; properties?: Record<string, any>; confidence?: string; source_doc_id?: string }) =>
    request<any>('/knowledge/graph/edges', {
      method: 'POST',
      body: JSON.stringify(edge),
    }),

  deleteGraphEdge: (edgeId: string) =>
    request<void>(`/knowledge/graph/edges/${edgeId}`, { method: 'DELETE' }),
};

export interface ServerChatMessage {
  id: string;
  project_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  options: Array<{ key: string; label: string; choices: string[] }> | null;
  sequence: number;
  created_at: string;
}
