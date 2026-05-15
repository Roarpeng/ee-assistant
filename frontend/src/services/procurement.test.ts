import { describe, it, expect } from 'vitest';
import { buildProcurementUrl } from './procurement';

describe('buildProcurementUrl', () => {
  it('routes Siemens manufacturer to Industry Mall search', () => {
    const url = buildProcurementUrl({
      manufacturer: 'Siemens',
      model: '6ES7215-1AG40-0XB0',
    });
    expect(url).toContain('siemens');
    expect(url).toContain('6ES7215-1AG40-0XB0');
  });

  it('routes Schneider manufacturer to Schneider site (se.com)', () => {
    // Schneider's China site is se.com (their consolidated short brand domain)
    const url = buildProcurementUrl({ manufacturer: 'Schneider', model: 'LC1D09M7' });
    expect(url).toContain('se.com');
    expect(url).toContain('LC1D09M7');
  });

  it('falls back to gongkong 工控网 search for unknown manufacturer', () => {
    const url = buildProcurementUrl({ manufacturer: 'NoName', model: 'XYZ-1' });
    expect(url).toContain('gongkong');
    expect(url).toContain('XYZ-1');
  });

  it('matches case-insensitively', () => {
    const url = buildProcurementUrl({ manufacturer: 'SIEMENS', model: 'M1' });
    expect(url).toContain('siemens');
  });

  it('encodes special characters', () => {
    const url = buildProcurementUrl({ manufacturer: 'NoName', model: 'A/B 1' });
    expect(url).toContain(encodeURIComponent('A/B 1'));
  });

  it('returns empty string when model is empty', () => {
    expect(buildProcurementUrl({ manufacturer: 'X', model: '' })).toBe('');
    expect(buildProcurementUrl({ manufacturer: 'X', model: '   ' })).toBe('');
  });
});
