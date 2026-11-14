import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { securitySchema } from './schemas';
import type { CseToolDeps } from './types';

export function createSymbolRegistryTool({ data }: CseToolDeps) {
  return createTool({
    id: 'symbol-registry',
    description:
      'Look up Colombo Stock Exchange (CSE) listed securities. Search by ticker, company name or sector. ' +
      'Use this to resolve a company name to its CSE symbol before calling other tools. Omit the query to list all.',
    inputSchema: z.object({
      query: z.string().trim().optional().describe('Ticker, company name or sector, e.g. "JKH", "Hatton", "Banking".'),
    }),
    outputSchema: z.object({
      matches: z.array(securitySchema),
      total: z.number(),
    }),
    execute: async ({ query }) => {
      const all = await data.listSymbols();
      const needle = query?.toLowerCase();
      const matches = needle
        ? all.filter((s) =>
            [s.symbol, s.companyId, s.companyName, s.sectorName].some((field) => field.toLowerCase().includes(needle)),
          )
        : all;
      return { matches, total: matches.length };
    },
  });
}
