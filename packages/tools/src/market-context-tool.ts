import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { marketIndexSchema, marketSummarySchema } from './schemas';
import type { CseToolDeps } from './types';

export function createMarketContextTool({ data }: CseToolDeps) {
  return createTool({
    id: 'market-context',
    description:
      'Get the overall CSE market picture, live from cse.lk: ASPI and S&P SL20 index levels and changes, market breadth ' +
      '(advancers / decliners), turnover and market status. Use to put a single stock move in context.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      summary: marketSummarySchema,
      indexes: z.array(marketIndexSchema),
      advanceDeclineRatio: z.number().nullable(),
      tone: z.enum(['positive', 'negative', 'mixed']),
    }),
    execute: async () => {
      const [summary, indexes] = await Promise.all([data.getMarketSummary(), data.getMarketIndexes()]);
      const advanceDeclineRatio = summary.decliners ? Number((summary.advancers / summary.decliners).toFixed(2)) : null;
      const indexesUp = indexes.filter((index) => (index.changePercent ?? 0) > 0).length;
      const breadthUp = summary.advancers > summary.decliners;
      const tone: 'positive' | 'negative' | 'mixed' =
        breadthUp && indexesUp === indexes.length ? 'positive' : !breadthUp && indexesUp === 0 ? 'negative' : 'mixed';
      return { summary, indexes, advanceDeclineRatio, tone };
    },
  });
}
