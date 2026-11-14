import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { percentChange } from './indicators';
import { barSchema, symbolInput } from './schemas';
import type { CseToolDeps } from './types';

export function createHistoricalMarketTool({ data }: CseToolDeps) {
  return createTool({
    id: 'historical-market',
    description: 'Get daily OHLCV price bars for one CSE stock, oldest first. Use for price history questions.',
    inputSchema: z.object({
      symbol: symbolInput,
      days: z.number().int().min(5).max(250).default(30).describe('Number of most recent trading days.'),
    }),
    outputSchema: z.object({
      symbol: z.string(),
      bars: z.array(barSchema),
      firstClose: z.number().nullable(),
      lastClose: z.number().nullable(),
      periodChangePercent: z.number().nullable(),
    }),
    execute: async ({ symbol, days }) => {
      const bars = await data.getHistory(symbol, days);
      const firstClose = bars.at(0)?.closePrice ?? null;
      const lastClose = bars.at(-1)?.closePrice ?? null;
      const periodChangePercent = firstClose !== null && lastClose !== null ? percentChange(firstClose, lastClose) : null;
      return { symbol: symbol.toUpperCase(), bars, firstClose, lastClose, periodChangePercent };
    },
  });
}
