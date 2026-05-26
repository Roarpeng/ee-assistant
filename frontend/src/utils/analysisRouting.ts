/** When ChatPanel should route to LangGraph analyze-v2 vs fast /chat. */
export const ENGINEERING_ANALYSIS_RE =
  /完整|生成|设计.*(系统|方案|控制)|选型|BOM|物料|拓扑|PLC|ST|SCL|代码|需求分析|控制系统|电气方案/;

export function shouldRunFullAnalysis(
  message: string,
  ctx: { hasCanvas: boolean; userTurns: number },
): boolean {
  if (ctx.hasCanvas) return false;
  if (ctx.userTurns > 1) return false;
  return ENGINEERING_ANALYSIS_RE.test(message);
}
