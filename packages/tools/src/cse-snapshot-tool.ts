import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { snapshotSchema, symbolInput } from './schemas';
import type { CseToolDeps } from './types';

export function createCseSnapshotTool({ data }: CseToolDeps) {
  return createTool({
    id: 'cse-snapshot',
    description:
      'Get the latest trading snapshot for one CSE stock: last traded price, change, open/high/low, volume, ' +
      'turnover, market cap, beta, foreign holdings and 52-week / YTD ranges.',
    inputSchema: z.object({ symbol: symbolInput }),
    outputSchema: snapshotSchema,
    execute: async ({ symbol }) => data.getSnapshot(symbol),
  });
}
