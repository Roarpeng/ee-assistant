import waterTreatment from './templates/water-treatment.json';
import packagingLine from './templates/packaging-line.json';
import conveyorVfd from './templates/conveyor-vfd.json';

export interface Template {
  id: string;
  name: string;
  summary: string;
  seedPrompt: string;
}

const REGISTRY: ReadonlyArray<Template> = [
  conveyorVfd,
  packagingLine,
  waterTreatment,
] as const;

export function listTemplates(): ReadonlyArray<Template> {
  return REGISTRY;
}

export function loadTemplate(id: string): Template | undefined {
  return REGISTRY.find((t) => t.id === id);
}
