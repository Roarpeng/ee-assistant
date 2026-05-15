/**
 * Memory-flywheel M2 feedback API client.
 *
 * Three POSTers (select / edit / negative) feed the `decisions` table that
 * the selection_supervisor reads to bias future suggestions for the same
 * org. One GETter fetches the per-component "why we picked this" signals
 * shown in the BOM ⓘ popover.
 *
 * All requests go through `authedFetch` so the X-Volta-Org-Token header
 * is attached automatically. Endpoints intentionally throw on non-2xx so
 * callers can fail fast — but for fire-and-forget UI hooks (e.g. drag-
 * persist on the topology canvas) the caller is expected to swallow the
 * rejection so a backend hiccup never breaks the canvas UX.
 */
import { authedFetch } from './orgClient';

const base = (projectId: string) => `/api/projects/${projectId}/feedback`;

export interface SelectFeedback {
  category: string;
  manufacturer: string;
  model: string;
  before?: unknown;
  rationale?: string;
}

export async function postSelectFeedback(projectId: string, body: SelectFeedback) {
  const r = await authedFetch(`${base(projectId)}/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`select feedback ${r.status}`);
  return r.json() as Promise<{ decision_id: string; weight: number }>;
}

export interface EditFeedback {
  target: 'bom' | 'wiring' | 'topology';
  before: unknown;
  after: unknown;
  rationale?: string;
}

export async function postEditFeedback(projectId: string, body: EditFeedback) {
  const r = await authedFetch(`${base(projectId)}/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`edit feedback ${r.status}`);
  return r.json() as Promise<{ decision_id: string }>;
}

export interface NegativeFeedback {
  target: 'bom_row' | 'general';
  context: Record<string, unknown>;
  rationale?: string;
}

export async function postNegativeFeedback(projectId: string, body: NegativeFeedback) {
  const r = await authedFetch(`${base(projectId)}/negative`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`negative feedback ${r.status}`);
  return r.json() as Promise<{ decision_id: string }>;
}

export interface MemorySources {
  org_pref_match: boolean;
  selection_weight: number;
  similar_episodes_count: number;
  kb_doc_hits: number;
  total_signals: number;
}

export async function fetchMemorySources(
  projectId: string,
  category: string,
  manufacturer: string,
  model: string,
): Promise<MemorySources> {
  const url = `/api/projects/${projectId}/memory-sources/${encodeURIComponent(category)}/${encodeURIComponent(manufacturer)}/${encodeURIComponent(model)}`;
  const r = await authedFetch(url);
  if (!r.ok) throw new Error(`memory-sources ${r.status}`);
  return r.json();
}
