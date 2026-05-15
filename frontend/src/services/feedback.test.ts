import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  postSelectFeedback,
  postEditFeedback,
  postNegativeFeedback,
  fetchMemorySources,
} from './feedback';
import { setStoredToken, clearStoredToken } from './orgClient';

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

describe('feedback service — POSTers', () => {
  beforeEach(() => {
    clearStoredToken();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('postSelectFeedback POSTs JSON to /feedback/select with token + body', async () => {
    setStoredToken('tok-sel');
    const spy = mockFetchOnce({ decision_id: 'd-1', weight: 1 }, { status: 201 });

    const out = await postSelectFeedback('proj-42', {
      category: 'PLC_CPU',
      manufacturer: 'Siemens',
      model: '1215C',
      rationale: 'manual override',
    });

    expect(out).toEqual({ decision_id: 'd-1', weight: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/projects/proj-42/feedback/select');
    const i = init as RequestInit;
    expect(i.method).toBe('POST');
    const headers = new Headers(i.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Volta-Org-Token')).toBe('tok-sel');
    expect(JSON.parse(String(i.body))).toEqual({
      category: 'PLC_CPU',
      manufacturer: 'Siemens',
      model: '1215C',
      rationale: 'manual override',
    });
  });

  it('postEditFeedback POSTs target/before/after to /feedback/edit and parses decision_id', async () => {
    const spy = mockFetchOnce({ decision_id: 'd-edit-7' }, { status: 201 });

    const out = await postEditFeedback('proj-7', {
      target: 'bom',
      before: { qty: 1 },
      after: { qty: 2 },
    });

    expect(out.decision_id).toBe('d-edit-7');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/projects/proj-7/feedback/edit');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.target).toBe('bom');
    expect(body.before).toEqual({ qty: 1 });
    expect(body.after).toEqual({ qty: 2 });
  });

  it('postNegativeFeedback POSTs context to /feedback/negative and throws on non-ok', async () => {
    const spy = mockFetchOnce({ decision_id: 'd-neg-3' }, { status: 201 });
    const out = await postNegativeFeedback('p1', {
      target: 'bom_row',
      context: { manufacturer: 'Acme', model: 'X9' },
    });
    expect(out.decision_id).toBe('d-neg-3');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/projects/p1/feedback/negative');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.target).toBe('bom_row');
    expect(body.context).toEqual({ manufacturer: 'Acme', model: 'X9' });

    // failure path
    mockFetchOnce({ detail: 'boom' }, { status: 500, ok: false });
    await expect(
      postNegativeFeedback('p1', { target: 'general', context: {} }),
    ).rejects.toThrow(/negative feedback 500/);
  });

  it('fetchMemorySources GETs URL-encoded path and returns the signals object', async () => {
    const payload = {
      org_pref_match: true,
      selection_weight: 2,
      similar_episodes_count: 0,
      kb_doc_hits: 0,
      total_signals: 2,
    };
    const spy = mockFetchOnce(payload);

    const out = await fetchMemorySources('p9', 'PLC CPU', 'Schneider/M340', 'BMX P34');

    expect(out).toEqual(payload);
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    // Spaces and slashes inside the segment must be percent-encoded
    expect(String(url)).toBe(
      '/api/projects/p9/memory-sources/PLC%20CPU/Schneider%2FM340/BMX%20P34',
    );
    // GET = no method override → undefined or 'GET'
    const method = (init as RequestInit | undefined)?.method;
    expect(method === undefined || method === 'GET').toBe(true);
  });
});
