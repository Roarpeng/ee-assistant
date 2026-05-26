import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { bomToArrayBuffer, wiringToArrayBuffer } from './spreadsheet';

describe('spreadsheet export', () => {
  it('writes BOM rows to xlsx buffer', () => {
    const buf = bomToArrayBuffer([
      {
        id: '1',
        name: 'PLC',
        mfg: 'Siemens',
        pn: '6ES7',
        qty: 1,
        specs: 'CPU',
      },
    ]);
    const book = XLSX.read(buf, { type: 'array' });
    const sheet = book.Sheets[book.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
    expect(rows[0]['元器件']).toBe('PLC');
  });

  it('writes wiring rows to xlsx buffer', () => {
    const buf = wiringToArrayBuffer([
      { tag: 'DI1', signal: '24V', from: 'PLC', to: 'Sensor', wire: '0.5mm²' },
    ]);
    const book = XLSX.read(buf, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(book.Sheets[book.SheetNames[0]]);
    expect(rows[0]['标签']).toBe('DI1');
  });
});
