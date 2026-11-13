import { ToolContext, ToolResult } from './types';

export class MarketContextTool {
  async execute(context: ToolContext): Promise<ToolResult<{ marketStatus: string; aspiChangePercent: number; snpChangePercent: number }>> {
    return {
      ok: true,
      data: {
        marketStatus: 'Open',
        aspiChangePercent: 0.58,
        snpChangePercent: 0.56,
      },
    };
  }
}
