import { ToolContext, ToolResult } from './types';

export class HistoricalMarketTool {
  async execute(context: ToolContext): Promise<ToolResult<Array<{ date: string; close: number; volume: number }>>> {
    const bars = Array.from({ length: 14 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (13 - index));

      return {
        date: date.toISOString().slice(0, 10),
        close: 190 + index * 1.8,
        volume: 900000 + index * 15000,
      };
    });

    return {
      ok: true,
      data: bars,
    };
  }
}
