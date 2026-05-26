import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { BOMItem } from '../models/store';
import { bomToArrayBuffer, wiringToArrayBuffer, type WiringRow } from './spreadsheet';

export interface ProjectExportPayload {
  projectName: string;
  bom: BOMItem[];
  ioItems: WiringRow[];
  sclCode: string;
  mermaidCode: string;
  topology: { nodes: unknown[]; edges: unknown[] };
  commissioningSteps: Array<{ title: string; body: string }>;
  safetyLevel?: string;
  bomCost?: number;
}

function safeFilename(name: string): string {
  return name.replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 64) || 'volta-project';
}

function commissioningMarkdown(steps: ProjectExportPayload['commissioningSteps']): string {
  if (steps.length === 0) {
    return '# Commissioning\n\n_No commissioning steps generated yet._\n';
  }
  const body = steps.map((s, i) => `## ${i + 1}. ${s.title}\n\n${s.body}`).join('\n\n');
  return `# Commissioning Guide\n\n${body}\n`;
}

/** Build a zip with BOM, wiring, SCL, topology JSON, schematic, and readme. */
export async function downloadProjectZip(payload: ProjectExportPayload): Promise<void> {
  const zip = new JSZip();
  const prefix = safeFilename(payload.projectName);

  if (payload.bom.length > 0) {
    zip.file('bom.xlsx', bomToArrayBuffer(payload.bom));
  }
  if (payload.ioItems.length > 0) {
    zip.file('wiring.xlsx', wiringToArrayBuffer(payload.ioItems));
  }
  if (payload.sclCode.trim()) {
    zip.file('program.scl', payload.sclCode);
  }
  if (payload.mermaidCode.trim()) {
    zip.file('schematic.mmd', payload.mermaidCode);
  }

  zip.file(
    'topology.json',
    JSON.stringify(
      {
        nodes: payload.topology.nodes,
        edges: payload.topology.edges,
        exported_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  zip.file(
    'project-meta.json',
    JSON.stringify(
      {
        name: payload.projectName,
        safety_level: payload.safetyLevel ?? null,
        bom_cost: payload.bomCost ?? null,
        bom_line_count: payload.bom.length,
        wiring_row_count: payload.ioItems.length,
        exported_at: new Date().toISOString(),
        generator: 'Volta EE Assistant',
      },
      null,
      2,
    ),
  );

  zip.file('commissioning.md', commissioningMarkdown(payload.commissioningSteps));
  zip.file(
    'README.txt',
    [
      'Volta Project Export',
      '====================',
      `Project: ${payload.projectName}`,
      '',
      'Contents:',
      '- bom.xlsx          Bill of materials',
      '- wiring.xlsx       Terminal / I/O wiring list',
      '- program.scl       PLC structured text (when generated)',
      '- schematic.mmd     Mermaid schematic source',
      '- topology.json     Confirmed topology snapshot',
      '- commissioning.md  Commissioning runbook',
      '- project-meta.json Export metadata',
      '',
      'Import schematic.mmd at https://mermaid.live or your docs toolchain.',
    ].join('\n'),
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${prefix}-volta-export.zip`);
}
