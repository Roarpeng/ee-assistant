/**
 * Memory-flywheel M3 client: episodic memory + weekly reports.
 *
 * Three calls, all via `authedFetch` so the X-Volta-Org-Token header is
 * attached automatically:
 *
 *   fetchEpisodes()   GET  /api/orgs/me/episodes
 *   fetchReports()    GET  /api/orgs/me/memory-reports
 *   consolidateNow()  POST /api/admin/consolidate-memory
 *
 * Endpoints intentionally throw on non-2xx so the MemoryTab can render an
 * error state.
 */
import { authedFetch } from './orgClient';

export interface Episode {
  id: string;
  project_id: string;
  org_id: string | null;
  summary: string;
  key_decisions: Array<Record<string, unknown>>;
  score: number;
  created_at: string;
}

export interface Report {
  id: string;
  org_id?: string | null;
  period_start: string;
  period_end: string;
  new_rules: Array<Record<string, unknown>>;
  revisions: Array<Record<string, unknown>>;
  gaps: Array<Record<string, unknown>>;
  metrics: Record<string, number>;
  created_at: string;
}

export interface ConsolidateResult {
  report_id: string;
  summary: {
    new_rules?: Array<Record<string, unknown>>;
    revisions?: Array<Record<string, unknown>>;
    gaps?: Array<Record<string, unknown>>;
    metrics?: Record<string, number>;
    [k: string]: unknown;
  };
}

export async function fetchEpisodes(limit = 20, offset = 0): Promise<Episode[]> {
  const r = await authedFetch(`/api/orgs/me/episodes?limit=${limit}&offset=${offset}`);
  if (!r.ok) throw new Error(`fetchEpisodes ${r.status}`);
  return r.json();
}

export async function fetchReports(limit = 10): Promise<Report[]> {
  const r = await authedFetch(`/api/orgs/me/memory-reports?limit=${limit}`);
  if (!r.ok) throw new Error(`fetchReports ${r.status}`);
  return r.json();
}

export async function consolidateNow(days = 7): Promise<ConsolidateResult> {
  const r = await authedFetch('/api/admin/consolidate-memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days }),
  });
  if (!r.ok) throw new Error(`consolidateNow ${r.status}`);
  return r.json();
}
