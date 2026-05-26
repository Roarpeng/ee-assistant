import * as XLSX from 'xlsx';
import type { BOMItem } from '../models/store';

export type WiringRow = {
  tag: string;
  signal: string;
  from: string;
  to: string;
  wire: string;
};

export function bomToArrayBuffer(items: BOMItem[]): ArrayBuffer {
  const rows = items.map((item, idx) => ({
    序号: idx + 1,
    元器件: item.name,
    制造商: item.mfg,
    型号: item.pn,
    数量: item.qty,
    规格: item.specs,
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'BOM');
  return XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

export function wiringToArrayBuffer(items: WiringRow[]): ArrayBuffer {
  const rows = items.map((item) => ({
    标签: item.tag,
    信号: item.signal,
    起点: item.from,
    终点: item.to,
    线径规格: item.wire,
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Wiring');
  return XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

export function downloadBomExcel(items: BOMItem[], filename = 'bom.xlsx') {
  const buf = bomToArrayBuffer(items);
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, filename);
}

export function downloadWiringExcel(items: WiringRow[], filename = 'wiring.xlsx') {
  const buf = wiringToArrayBuffer(items);
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
