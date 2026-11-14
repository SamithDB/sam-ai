import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getUserId } from './context';
import { symbolInput, watchlistEntrySchema } from './schemas';
import type { CseToolDeps } from './types';

const triggeredAlertSchema = z.object({
  symbol: z.string(),
  lastTradedPrice: z.number(),
  condition: z.enum(['above', 'below']),
  threshold: z.number(),
});

type TriggeredAlert = z.infer<typeof triggeredAlertSchema>;

export function createWatchlistStoreTool({ data, watchlist }: CseToolDeps) {
  return createTool({
    id: 'watchlist-store',
    description:
      "Manage the current user's watchlist. Actions: 'list' entries; 'add' (or update) a symbol with optional " +
      "alertAbove / alertBelow price thresholds and a note; 'remove' a symbol; 'check-alerts' compares current " +
      'prices with thresholds and returns the alerts that are triggered.',
    inputSchema: z.object({
      action: z.enum(['list', 'add', 'remove', 'check-alerts']),
      symbol: symbolInput.optional().describe("Required for 'add' and 'remove'."),
      alertAbove: z.number().positive().optional(),
      alertBelow: z.number().positive().optional(),
      note: z.string().max(280).optional(),
    }),
    outputSchema: z.object({
      message: z.string(),
      entries: z.array(watchlistEntrySchema),
      triggered: z.array(triggeredAlertSchema),
    }),
    execute: async (input, context) => {
      const userId = getUserId(context);
      const result = async (message: string, triggered: TriggeredAlert[] = []) => ({
        message,
        entries: await watchlist.list(userId),
        triggered,
      });

      if (input.action === 'add' || input.action === 'remove') {
        if (!input.symbol) {
          return result(`A symbol is required to ${input.action} a watchlist entry.`);
        }
        // Resolves the canonical symbol and rejects unknown tickers.
        const { symbol } = await data.getSnapshot(input.symbol);

        if (input.action === 'remove') {
          const removed = await watchlist.remove(userId, symbol);
          return result(removed ? `Removed ${symbol} from the watchlist.` : `${symbol} was not on the watchlist.`);
        }

        await watchlist.upsert({
          userId,
          symbol,
          addedAt: new Date().toISOString(),
          alertAbove: input.alertAbove,
          alertBelow: input.alertBelow,
          note: input.note,
        });
        return result(`Saved ${symbol} to the watchlist.`);
      }

      if (input.action === 'list') {
        const entries = await watchlist.list(userId);
        return { message: `${entries.length} symbol(s) on the watchlist.`, entries, triggered: [] };
      }

      const entries = await watchlist.list(userId);
      const triggered: TriggeredAlert[] = [];
      for (const entry of entries) {
        if (entry.alertAbove === undefined && entry.alertBelow === undefined) continue;
        const { lastTradedPrice } = await data.getSnapshot(entry.symbol);
        if (entry.alertAbove !== undefined && lastTradedPrice >= entry.alertAbove) {
          triggered.push({ symbol: entry.symbol, lastTradedPrice, condition: 'above', threshold: entry.alertAbove });
        }
        if (entry.alertBelow !== undefined && lastTradedPrice <= entry.alertBelow) {
          triggered.push({ symbol: entry.symbol, lastTradedPrice, condition: 'below', threshold: entry.alertBelow });
        }
      }
      return { message: `${triggered.length} alert(s) triggered.`, entries, triggered };
    },
  });
}
