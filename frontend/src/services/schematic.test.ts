import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchSchematicPages, regenerateSchematicPages, KIND_LABELS } from './schematic';
import { clearStoredToken } from './orgClient';

function mockFetchOnce(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

describe('schematic service', () => {
  beforeEach(() => {
    clearStoredToken();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchSchematicPages GETs the pages endpoint', async () => {
    const payload = {
      project_id: 'p1',
      source_topology_version: 2,
      pages: [
        { page_no: 1, kind: 'power', title_zh: '主回路', svg: '<svg/>', notes: [] },
        { page_no: 2, kind: 'control', title_zh: '控制回路', svg: '<svg/>', notes: ['SIL2 双通道'] },
      ],
    };
    const spy = mockFetchOnce(payload);
    const res = await fetchSchematicPages('p1');
    expect(spy).toHaveBeenCalledWith('/api/projects/p1/schematic/pages', expect.anything());
    expect(res?.pages).toHaveLength(2);
    expect(res?.pages[1].notes).toEqual(['SIL2 双通道']);
  });

  it('fetchSchematicPages returns null on 404 (no pages derived yet)', async () => {
    mockFetchOnce({ detail: 'No schematic pages derived yet' }, { status: 404 });
    const res = await fetchSchematicPages('p1');
    expect(res).toBeNull();
  });

  it('regenerateSchematicPages POSTs and returns pages', async () => {
    const payload = { project_id: 'p1', source_topology_version: 3, pages: [] };
    const spy = mockFetchOnce(payload);
    const res = await regenerateSchematicPages('p1');
    expect(spy).toHaveBeenCalledWith('/api/projects/p1/schematic/pages', expect.objectContaining({ method: 'POST' }));
    expect(res.source_topology_version).toBe(3);
  });

  it('regenerateSchematicPages throws on server error', async () => {
    mockFetchOnce({ detail: 'Schematic IR invalid' }, { status: 422 });
    await expect(regenerateSchematicPages('p1')).rejects.toThrow('422');
  });

  it('exposes Chinese kind labels for tabs', () => {
    expect(KIND_LABELS.power).toBe('主回路');
    expect(KIND_LABELS.control).toBe('控制回路');
    expect(KIND_LABELS.io).toBe('端子/IO');
  });
});
