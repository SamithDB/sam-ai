import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { analyzeBars } from './indicators';
import { sourceSchema, symbolInput } from './schemas';
import type { CseToolDeps } from './types';

export function createTechnicalAnalysisTool({ data }: CseToolDeps) {
  return createTool({
    id: 'technical-analysis',
    description:
      'Compute technical indicators for one CSE stock from its daily history: SMA 5/20/50, RSI(14), 5- and 20-day ' +
      'returns, average daily range, trend classification and a 0-100 momentum score, plus plain-language signals and risks.',
    inputSchema: z.object({
      symbol: symbolInput,
      days: z.number().int().min(20).max(250).default(60).describe('History window to analyze.'),
    }),
    outputSchema: z.object({
      symbol: z.string(),
      source: sourceSchema,
      barsAnalyzed: z.number(),
      lastClose: z.number(),
      sma5: z.number().nullable(),
      sma20: z.number().nullable(),
      sma50: z.number().nullable(),
      rsi14: z.number().nullable(),
      change5dPercent: z.number().nullable(),
      change20dPercent: z.number().nullable(),
      avgDailyRangePercent: z.number().nullable(),
      trend: z.enum(['uptrend', 'downtrend', 'sideways']),
      momentumScore: z.number(),
      signals: z.array(z.string()),
      risks: z.array(z.string()),
    }),
    execute: async ({ symbol, days }) => {
      const [snapshot, bars] = await Promise.all([data.getSnapshot(symbol), data.getHistory(symbol, days)]);
      return { symbol: snapshot.symbol, source: snapshot.source, ...analyzeBars(bars) };
    },
  });
}
