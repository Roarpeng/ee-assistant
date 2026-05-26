import { describe, it, expect } from 'vitest';
import { shouldRunFullAnalysis } from './analysisRouting';

describe('shouldRunFullAnalysis', () => {
  it('runs full analysis on first engineering message with empty canvas', () => {
    expect(
      shouldRunFullAnalysis('请完整生成输送线控制系统', { hasCanvas: false, userTurns: 1 }),
    ).toBe(true);
  });

  it('skips full analysis when canvas already has content', () => {
    expect(
      shouldRunFullAnalysis('完整生成 BOM', { hasCanvas: true, userTurns: 1 }),
    ).toBe(false);
  });

  it('skips full analysis after the first user turn', () => {
    expect(
      shouldRunFullAnalysis('完整生成', { hasCanvas: false, userTurns: 2 }),
    ).toBe(false);
  });

  it('skips casual chat without engineering keywords', () => {
    expect(
      shouldRunFullAnalysis('你好', { hasCanvas: false, userTurns: 1 }),
    ).toBe(false);
  });
});
