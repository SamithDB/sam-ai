import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { securitySchema } from './schemas';
import type { CseToolDeps } from './types';

const MAX_MATCHES = 50;

export function createSymbolRegistryTool({ data }: CseToolDeps) {
  return createTool({
    id: 'symbol-registry',
    description:
      'Look up securities listed on the Colombo Stock Exchange (CSE), live from cse.lk. Search by ticker or company ' +
      'name. Use this to resolve a company name to its CSE symbol before calling other tools.',
    inputSchema: z.object({
      query: z.string().trim().optional().describe('Ticker or company name, e.g. "JKH", "Hatton". Omit to list.'),
    }),
    outputSchema: z.object({
      matches: z.array(securitySchema),
      total: z.number().describe('Number of matches before truncating to the first 50.'),
    }),
    execute: async ({ query }) => {
      const all = await data.listSymbols();
      const needle = query?.toLowerCase();
      const matches = needle
        ? all.filter((s) => [s.symbol, s.companyId, s.companyName].some((field) => field.toLowerCase().includes(needle)))
        : all;
      return { matches: matches.slice(0, MAX_MATCHES), total: matches.length };
    },
  });
}
