import { ToolContext, ToolResult } from './types';

export class ReportFormatterTool {
  async execute(context: ToolContext, payload: Record<string, unknown>): Promise<ToolResult<{ summary: string; headline: string }>> {
    return {
      ok: true,
      data: {
        headline: `Stock view for ${context.symbol}`,
        summary: `The current market setup suggests a constructive tone for ${context.symbol}.`,
      },
    };
  }
}
