export type ConfidenceLevel = 'rag' | 'llm' | 'mixed';

export interface BOMItem {
  id: string;
  category: string;
  manufacturer: string;
  model: string;
  quantity: number;
  specifications: Record<string, string | number>;
  confidence: ConfidenceLevel;
  sourceChunkId: string | null;
  alternatives: Array<{ manufacturer: string; model: string; reason: string }>;
}
