export type ModuleType = 'OB' | 'FC' | 'FB' | 'DB';

export interface STModule {
  id: string;
  name: string;
  moduleType: ModuleType;
  code: string;
  sortOrder: number;
}
