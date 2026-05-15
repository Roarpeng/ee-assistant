import { describe, it, expect } from 'vitest';
import { listTemplates, loadTemplate } from './templates';

describe('templates registry', () => {
  it('exposes at least three templates', () => {
    const t = listTemplates();
    expect(t.length).toBeGreaterThanOrEqual(3);
  });

  it('every template has id, name, summary, and seedPrompt', () => {
    for (const t of listTemplates()) {
      expect(t.id).toBeTypeOf('string');
      expect(t.id.length).toBeGreaterThan(0);
      expect(t.name).toBeTypeOf('string');
      expect(t.summary).toBeTypeOf('string');
      expect(t.seedPrompt).toBeTypeOf('string');
      expect(t.seedPrompt.length).toBeGreaterThan(10);
    }
  });

  it('ids are unique', () => {
    const ids = listTemplates().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('loadTemplate returns the seed payload by id', () => {
    const t = loadTemplate('conveyor-vfd');
    expect(t).toBeDefined();
    expect(t?.seedPrompt).toMatch(/传送带|VFD/);
  });

  it('returns undefined for an unknown id', () => {
    expect(loadTemplate('does-not-exist-xyz')).toBeUndefined();
  });
});
