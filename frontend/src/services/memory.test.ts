import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchEpisodes, fetchReports, consolidateNow } from './memory';
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

describe('memory service', () => {
  beforeEach(() => {
    clearStoredToken();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchEpisodes GETs /api/orgs/me/episodes with limit+offset and token', async () => {
    setStoredToken('tok-eps');
    const payload = [
      {
        id: 'ep-1',
        project_id: 'p-1',
        org_id: 'org-1',
        summary: '滑台 (SIL2) — 1 处手动选型',
        key_decisions: [{ cat: 'PLC_CPU', after: '1215C', type: 'manual_select' }],
        score: 0.5,
        created_at: '2026-05-14T08:00:00Z',
      },
    ];
    const spy = mockFetchOnce(payload);

    const out = await fetchEpisodes(5, 10);

    expect(out).toEqual(payload);
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/orgs/me/episodes?limit=5&offset=10');
    const headers = new Headers((init as RequestInit | undefined)?.headers);
    expect(headers.get('X-Volta-Org-Token')).toBe('tok-eps');

    mockFetchOnce({ detail: 'nope' }, { status: 500, ok: false });
    await expect(fetchEpisodes()).rejects.toThrow(/fetchEpisodes 500/);
  });

  it('fetchReports GETs /api/orgs/me/memory-reports with limit and token', async () => {
    setStoredToken('tok-rep');
    const payload = [
      {
        id: 'rep-1',
        period_start: '2026-05-07T00:00:00Z',
        period_end: '2026-05-14T00:00:00Z',
        new_rules: [],
        revisions: [],
        gaps: [],
        metrics: { decisions_scanned: 0 },
        created_at: '2026-05-14T00:00:00Z',
      },
    ];
    const spy = mockFetchOnce(payload);

    const out = await fetchReports(3);

    expect(out).toEqual(payload);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/orgs/me/memory-reports?limit=3');
    const method = (init as RequestInit | undefined)?.method;
    expect(method === undefined || method === 'GET').toBe(true);
  });

  it('consolidateNow POSTs JSON body to /api/admin/consolidate-memory and parses the response', async () => {
    const spy = mockFetchOnce(
      { report_id: 'rep-42', summary: { new_rules: [], metrics: {} } },
      { status: 201 },
    );

    const out = await consolidateNow(14);

    expect(out.report_id).toBe('rep-42');
    expect(out.summary).toBeDefined();
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/admin/consolidate-memory');
    const i = init as RequestInit;
    expect(i.method).toBe('POST');
    const headers = new Headers(i.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(i.body))).toEqual({ days: 14 });

    mockFetchOnce({ detail: 'boom' }, { status: 500, ok: false });
    await expect(consolidateNow()).rejects.toThrow(/consolidateNow 500/);
  });
});
