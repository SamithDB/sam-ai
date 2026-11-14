import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { CseCompanySnapshot } from './domain';
import { symbolInput } from './schemas';
import type { CseToolDeps } from './types';

const peerSchema = z.object({
  symbol: z.string(),
  companyName: z.string(),
  lastTradedPrice: z.number(),
  changePercent: z.number(),
  marketCap: z.number(),
});

type RelativeStrength = 'outperforming' | 'in-line' | 'underperforming' | 'no-peers';

const toPeer = (s: CseCompanySnapshot) => ({
  symbol: s.symbol,
  companyName: s.companyName,
  lastTradedPrice: s.lastTradedPrice,
  changePercent: s.changePercent,
  marketCap: s.marketCap,
});

export function createSectorComparisonTool({ data }: CseToolDeps) {
  return createTool({
    id: 'sector-comparison',
    description:
      'Compare the latest price move and market cap of one CSE stock against the other listed companies in its sector.',
    inputSchema: z.object({ symbol: symbolInput }),
    outputSchema: z.object({
      sectorName: z.string(),
      target: peerSchema,
      peers: z.array(peerSchema),
      sectorAvgChangePercent: z.number().nullable(),
      relativeStrength: z.enum(['outperforming', 'in-line', 'underperforming', 'no-peers']),
    }),
    execute: async ({ symbol }) => {
      const target = await data.getSnapshot(symbol);
      const universe = await data.listSymbols();
      const sectorName = universe.find((s) => s.symbol === target.symbol)?.sectorName ?? 'Unknown';
      const peerSymbols = universe
        .filter((s) => s.sectorName === sectorName && s.symbol !== target.symbol && s.isActive)
        .map((s) => s.symbol);
      const peers = (await Promise.all(peerSymbols.map((peer) => data.getSnapshot(peer)))).map(toPeer);

      let sectorAvgChangePercent: number | null = null;
      let relativeStrength: RelativeStrength = 'no-peers';
      if (peers.length > 0) {
        sectorAvgChangePercent = Number((peers.reduce((sum, p) => sum + p.changePercent, 0) / peers.length).toFixed(2));
        const diff = target.changePercent - sectorAvgChangePercent;
        relativeStrength = diff > 0.5 ? 'outperforming' : diff < -0.5 ? 'underperforming' : 'in-line';
      }

      return { sectorName, target: toPeer(target), peers, sectorAvgChangePercent, relativeStrength };
    },
  });
}
