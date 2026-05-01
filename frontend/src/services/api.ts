const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  createProject: (name: string) =>
    request<import('../models/project').Project>(`/projects?name=${encodeURIComponent(name)}`, { method: 'POST' }),

  getProject: (id: string) =>
    request<import('../models/project').Project>(`/projects/${id}`),

  listProjects: () =>
    request<import('../models/project').Project[]>(`/projects`),

  deleteProject: (id: string) =>
    request<void>(`/projects/${id}`, { method: 'DELETE' }),

  analyze: (projectId: string, text: string) =>
    request<any>(`/projects/${projectId}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  runSelection: (projectId: string) =>
    request<any>(`/projects/${projectId}/select`, {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId }),
    }),

  generateSchematic: (projectId: string) =>
    request<any>(`/projects/${projectId}/schematic`, {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId }),
    }),

  generateCode: (projectId: string) =>
    request<any>(`/projects/${projectId}/codegen`, {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId }),
    }),

  uploadKnowledgeDoc: (formData: FormData) =>
    fetch(`${BASE}/knowledge/docs`, { method: 'POST', body: formData }),

  searchKnowledge: (query: string, filters?: { category?: string[]; manufacturer?: string }) =>
    request<any>(`/knowledge/search`, {
      method: 'POST',
      body: JSON.stringify({ query, category_filter: filters?.category, manufacturer_filter: filters?.manufacturer, top_k: 5 }),
    }),

  listKnowledgeDocs: () =>
    request<any[]>(`/knowledge/docs`),

  deleteKnowledgeDoc: (id: string) =>
    request<void>(`/knowledge/docs/${id}`, { method: 'DELETE' }),
};
