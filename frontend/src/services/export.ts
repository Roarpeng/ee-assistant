import type { Project } from '../models/project';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export const exportService = {
  export(project: Project, format: 'svg' | 'excel' | 'pdf' | 'print', tab: string) {
    switch (format) {
      case 'svg':
        this.exportSVG(project);
        break;
      case 'excel':
        this.exportExcel(project);
        break;
      case 'pdf':
        this.exportPDF(project);
        break;
      case 'print':
        window.print();
        break;
    }
  },

  exportSVG(project: Project) {
    const svg = document.querySelector('.canvas-content svg');
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    saveAs(blob, `${project.name}-schematic.svg`);
  },

  exportExcel(project: Project) {
    const rows = project.bomItems.map((i) => ({
      Category: i.category,
      Manufacturer: i.manufacturer,
      Model: i.model,
      Quantity: i.quantity,
      Confidence: i.confidence,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BOM');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    saveAs(new Blob([buf]), `${project.name}-bom.xlsx`);
  },

  exportPDF(project: Project) {
    const content = document.querySelector('.canvas-content');
    if (!content) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${project.name}</title></head><body>${content.innerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.print();
  },
};
