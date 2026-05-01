import type { BOMItem } from './selection';
import type { Schematic } from './schematic';
import type { STModule } from './codegen';

export type IOType = 'DI' | 'DO' | 'AI' | 'AO';

export interface IOItem {
  id: string;
  tag: string;
  ioType: IOType;
  description: string;
}

export interface LogicRule {
  id: string;
  description: string;
}

export interface Requirement {
  id: string;
  machineType: string | null;
  safetyLevel: string | null;
  environment: string | null;
  plcFamily: string | null;
  rawText: string | null;
  ioItems: IOItem[];
  logicRules: LogicRule[];
}

export type ProjectStatus = 'draft' | 'analyzing' | 'ready' | 'selecting' | 'done';

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  requirement: Requirement | null;
  bomItems: BOMItem[];
  schematic: Schematic | null;
  codeModules: STModule[];
}
