// Circuit-level schematic page API client (MVS Service layer).
//
// Pages are derived server-side from the confirmed topology (deterministic
// generator + LLM review) and arrive pre-rendered as SVG strings.

import { authedFetch } from './orgClient';

const BASE = '/api';

export type SchematicPageKind = 'power' | 'control' | 'io' | 'title';

export interface SchematicCrossRef {
  kind: string;
  ref: string;
  pages: string[];
  detail?: string;
}

export interface SchematicPageInfo {
  page_no: number;
  kind: SchematicPageKind;
  title_zh: string;
  svg: string | null;
  notes?: string[];
  cross_refs?: SchematicCrossRef[];
}

export interface SchematicPagesResponse {
  project_id: string;
  source_topology_version: number;
  pages: SchematicPageInfo[];
}

export async function fetchSchematicPages(projectId: string): Promise<SchematicPagesResponse | null> {
  const res = await authedFetch(`${BASE}/projects/${projectId}/schematic/pages`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function regenerateSchematicPages(projectId: string): Promise<SchematicPagesResponse> {
  const res = await authedFetch(`${BASE}/projects/${projectId}/schematic/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const KIND_LABELS: Record<SchematicPageKind, string> = {
  power: '主回路',
  control: '控制回路',
  io: '端子/IO',
  title: '封面',
};
