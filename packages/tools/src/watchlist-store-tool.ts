import { ToolContext, ToolResult } from './types';

export class WatchlistStoreTool {
  async execute(context: ToolContext): Promise<ToolResult<{ id: string; symbol: string; userId?: string }>> {
    return {
      ok: true,
      data: {
        id: `watch-${context.symbol.toLowerCase()}`,
        symbol: context.symbol,
        userId: context.userId,
      },
    };
  }
}
