import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { sectorSchema } from './schemas';
import type { CseToolDeps } from './types';

export function createSectorPerformanceTool({ data }: CseToolDeps) {
  return createTool({
    id: 'sector-performance',
    description:
      "Today's performance of the S&P/CSE sector indices (e.g. Banks, Capital Goods, Energy), live from cse.lk, ranked " +
      'by % change, with the ASPI move for comparison. cse.lk does not publish which sector a company belongs to, so ' +
      'this tool cannot list a stock\'s peers.',
    inputSchema: z.object({
      sector: z.string().trim().optional().describe('Filter by sector name, e.g. "Banks". Omit for all sectors.'),
    }),
    outputSchema: z.object({
      sectors: z.array(sectorSchema),
      aspiChangePercent: z.number().nullable(),
      sectorsUp: z.number(),
      sectorsDown: z.number(),
    }),
    execute: async ({ sector }) => {
      const [all, indexes] = await Promise.all([data.getSectors(), data.getMarketIndexes()]);
      const needle = sector?.toLowerCase();
      const sectors = (needle
        ? all.filter((s) => s.name.toLowerCase().includes(needle) || s.indexName.toLowerCase().includes(needle))
        : all
      ).sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity));
      return {
        sectors,
        aspiChangePercent: indexes.find((i) => i.indexCode === 'ASPI')?.changePercent ?? null,
        sectorsUp: all.filter((s) => (s.changePercent ?? 0) > 0).length,
        sectorsDown: all.filter((s) => (s.changePercent ?? 0) < 0).length,
      };
    },
  });
}
