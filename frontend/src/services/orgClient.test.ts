import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getStoredToken,
  setStoredToken,
  clearStoredToken,
  authedFetch,
  orgApi,
  PREF_KEYS,
} from './orgClient';

function mockFetchOnce(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

describe('orgClient — token storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a token through localStorage', () => {
    expect(getStoredToken()).toBeNull();
    setStoredToken('abc-123');
    expect(getStoredToken()).toBe('abc-123');
  });

  it('clearStoredToken removes the token', () => {
    setStoredToken('temp-token');
    expect(getStoredToken()).toBe('temp-token');
    clearStoredToken();
    expect(getStoredToken()).toBeNull();
  });
});

describe('orgClient — authedFetch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not attach header when no token is stored', async () => {
    const spy = mockFetchOnce({ ok: true });
    await authedFetch('/api/something');
    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0];
    const init = call[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('X-Volta-Org-Token')).toBeNull();
  });

  it('attaches X-Volta-Org-Token when a token is stored', async () => {
    setStoredToken('my-secret-token');
    const spy = mockFetchOnce({ ok: true });
    await authedFetch('/api/something');
    expect(spy).toHaveBeenCalledTimes(1);
    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('X-Volta-Org-Token')).toBe('my-secret-token');
  });

  it('preserves caller-supplied headers when injecting the token', async () => {
    setStoredToken('my-secret-token');
    const spy = mockFetchOnce({ ok: true });
    await authedFetch('/api/something', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Other': 'value' },
      body: '{}',
    });
    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Other')).toBe('value');
    expect(headers.get('X-Volta-Org-Token')).toBe('my-secret-token');
    expect(init.method).toBe('POST');
  });
});

describe('orgClient — orgApi', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bootstrap POSTs /api/orgs and returns the created org+token', async () => {
    const spy = mockFetchOnce({
      id: 'org-1',
      name: 'Default Org',
      code: 'defaultorg-abcd1234',
      token: 'tok-xyz',
    });
    const out = await orgApi.bootstrap('Default Org');
    expect(out.token).toBe('tok-xyz');
    expect(out.id).toBe('org-1');
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/orgs');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ name: 'Default Org' });
  });

  it('bootstrap throws when the response is not ok', async () => {
    mockFetchOnce({ detail: 'boom' }, { status: 500, ok: false });
    await expect(orgApi.bootstrap()).rejects.toThrow(/bootstrap 500/);
  });

  it('me() sends the stored token via X-Volta-Org-Token', async () => {
    setStoredToken('the-token');
    const spy = mockFetchOnce({ id: 'org-2', name: 'Acme', code: 'acme-1' });
    const out = await orgApi.me();
    expect(out.name).toBe('Acme');
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('X-Volta-Org-Token')).toBe('the-token');
  });

  it('listPreferences GETs /api/orgs/me/preferences with the token', async () => {
    setStoredToken('tok-list');
    const spy = mockFetchOnce([
      {
        key: 'preferred_plc_family',
        value: { family: 'S7-1200' },
        confidence: 0.8,
        source: 'clarify',
        updated_at: '2026-05-14T00:00:00Z',
      },
    ]);
    const prefs = await orgApi.listPreferences();
    expect(prefs).toHaveLength(1);
    expect(prefs[0].key).toBe('preferred_plc_family');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/orgs/me/preferences');
    expect(new Headers((init as RequestInit).headers).get('X-Volta-Org-Token')).toBe('tok-list');
  });

  it('upsertPreference PUTs to /api/orgs/me/preferences/{key} with body', async () => {
    setStoredToken('tok-up');
    const spy = mockFetchOnce({
      key: 'default_safety_level',
      value: { level: 'SIL2' },
      confidence: 0.9,
      source: 'admin',
      updated_at: '2026-05-14T00:00:00Z',
    });
    const out = await orgApi.upsertPreference(
      'default_safety_level',
      { level: 'SIL2' },
      { confidence: 0.9, source: 'admin' },
    );
    expect(out.confidence).toBe(0.9);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/orgs/me/preferences/default_safety_level');
    expect((init as RequestInit).method).toBe('PUT');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toEqual({ value: { level: 'SIL2' }, confidence: 0.9, source: 'admin' });
  });

  it('upsertPreference url-encodes keys with special characters', async () => {
    setStoredToken('tok-enc');
    const spy = mockFetchOnce({
      key: 'k/with space',
      value: {},
      confidence: 0.5,
      source: 'admin',
      updated_at: '2026-05-14T00:00:00Z',
    });
    await orgApi.upsertPreference('k/with space', {});
    expect(String(spy.mock.calls[0][0])).toBe('/api/orgs/me/preferences/k%2Fwith%20space');
  });

  it('deletePreference DELETEs and tolerates 204', async () => {
    setStoredToken('tok-del');
    const spy = mockFetchOnce(undefined, { status: 204, ok: false });
    await orgApi.deletePreference('preferred_plc_family');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/orgs/me/preferences/preferred_plc_family');
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('PREF_KEYS exposes the canonical key list (matches backend)', () => {
    expect(PREF_KEYS).toEqual([
      'preferred_plc_family',
      'default_safety_level',
      'default_environment',
      'voltage_standard',
      'preferred_hmi_brand',
      'brand_blacklist',
    ]);
  });
});
