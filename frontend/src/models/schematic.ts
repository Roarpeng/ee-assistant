export interface FrameworkNode {
  id: string;
  label: string;
  children?: FrameworkNode[];
  details?: Record<string, string>;
}

export interface Schematic {
  id: string;
  mermaidCode: string;
  svgData: string | null;
}
