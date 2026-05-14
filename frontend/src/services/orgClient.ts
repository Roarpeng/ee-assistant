/**
 * Org-token storage + authed-fetch wrapper.
 *
 * Bootstrap flow (first launch, no token in localStorage):
 *   1. POST /api/orgs {name: "Default Org"}
 *   2. server returns {id, name, code, token} — token shown ONCE
 *   3. we store the token in localStorage under `volta-org-token`
 *   4. every subsequent fetch sends X-Volta-Org-Token header
 *
 * Replace the org by clearing localStorage and reloading the page.
 */
const STORAGE_KEY = 'volta-org-token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string) {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {}
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** fetch() with X-Volta-Org-Token header attached if present */
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('X-Volta-Org-Token', token);
  return fetch(input, { ...init, headers });
}

export interface OrgInfo {
  id: string;
  name: string;
  code: string;
}

export interface OrgCreated extends OrgInfo {
  token: string;
}

export interface OrgPreference {
  key: string;
  value: Record<string, unknown>;
  confidence: number;
  source: string;
  updated_at: string;
}

export const orgApi = {
  async bootstrap(name = 'Default Org'): Promise<OrgCreated> {
    const r = await fetch('/api/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) throw new Error(`bootstrap ${r.status}`);
    return r.json();
  },

  async me(): Promise<OrgInfo> {
    const r = await authedFetch('/api/orgs/me');
    if (!r.ok) throw new Error(`me ${r.status}`);
    return r.json();
  },

  async listPreferences(): Promise<OrgPreference[]> {
    const r = await authedFetch('/api/orgs/me/preferences');
    if (!r.ok) throw new Error(`list prefs ${r.status}`);
    return r.json();
  },

  async upsertPreference(
    key: string,
    value: Record<string, unknown>,
    opts?: { confidence?: number; source?: string },
  ): Promise<OrgPreference> {
    const r = await authedFetch(`/api/orgs/me/preferences/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, ...opts }),
    });
    if (!r.ok) throw new Error(`upsert pref ${r.status}`);
    return r.json();
  },

  async deletePreference(key: string): Promise<void> {
    const r = await authedFetch(`/api/orgs/me/preferences/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
    if (!r.ok && r.status !== 204) throw new Error(`delete pref ${r.status}`);
  },
};

/** Canonical preference keys recognised by the backend. Mirrors
 * `backend/app/core/org_prefs_keys.py`. The OrgSettingsPanel uses
 * this list to populate its key dropdown so users only ever pick
 * keys the backend can resolve. */
export const PREF_KEYS = [
  'preferred_plc_family',
  'default_safety_level',
  'default_environment',
  'voltage_standard',
  'preferred_hmi_brand',
  'brand_blacklist',
] as const;

export type PrefKey = (typeof PREF_KEYS)[number];
