import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { announcementSchema, symbolInput } from './schemas';
import type { CseToolDeps } from './types';

export function createAnnouncementsTool({ data }: CseToolDeps) {
  return createTool({
    id: 'announcements',
    description:
      'Get corporate announcements (dividends, financial results, disclosures) filed with the CSE. ' +
      'Pass a symbol for one company, or omit it for the latest market-wide announcements.',
    inputSchema: z.object({
      symbol: symbolInput.optional(),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    outputSchema: z.object({ announcements: z.array(announcementSchema), total: z.number() }),
    execute: async ({ symbol, limit }) => {
      const all = await data.getAnnouncements(symbol);
      const sorted = [...all].sort((a, b) => b.announcementDate.localeCompare(a.announcementDate));
      return { announcements: sorted.slice(0, limit), total: all.length };
    },
  });
}
