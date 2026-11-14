import { z } from 'zod';

export const symbolInput = z
  .string()
  .trim()
  .min(1)
  .describe('CSE ticker, e.g. "JKH" or "JKH.N0000". Use the symbol-registry tool first if unsure.');

export const securitySchema = z.object({
  symbol: z.string(),
  companyId: z.string(),
  companyName: z.string(),
  sectorName: z.string(),
  instrumentType: z.enum(['equity', 'index', 'other']),
  isActive: z.boolean(),
});

export const sourceSchema = z
  .enum(['fixture', 'live'])
  .describe('"fixture" means sample data, not real market data. Always tell the user when data is sample data.');

export const snapshotSchema = z.object({
  symbol: z.string(),
  companyName: z.string(),
  tradedDate: z.string(),
  lastTradedPrice: z.number(),
  previousClose: z.number(),
  openPrice: z.number(),
  highPrice: z.number(),
  lowPrice: z.number(),
  changeValue: z.number(),
  changePercent: z.number(),
  volume: z.number(),
  turnover: z.number(),
  marketCap: z.number(),
  beta: z.number(),
  foreignHoldings: z.number(),
  week52High: z.number(),
  week52Low: z.number(),
  ytdHigh: z.number(),
  ytdLow: z.number(),
  source: sourceSchema,
});

export const barSchema = z.object({
  barDate: z.string(),
  openPrice: z.number(),
  highPrice: z.number(),
  lowPrice: z.number(),
  closePrice: z.number(),
  volume: z.number(),
  turnover: z.number(),
});

export const announcementSchema = z.object({
  symbol: z.string(),
  announcementId: z.string(),
  announcementDate: z.string(),
  title: z.string(),
  summary: z.string(),
  category: z.string(),
  url: z.string(),
});

export const marketSummarySchema = z.object({
  tradedDate: z.string(),
  advancers: z.number(),
  decliners: z.number(),
  unchanged: z.number(),
  totalTurnover: z.number(),
  totalVolume: z.number(),
  marketStatus: z.string(),
});

export const marketIndexSchema = z.object({
  indexCode: z.enum(['ASPI', 'SNP']),
  label: z.string(),
  tradedDate: z.string(),
  closeValue: z.number(),
  changeValue: z.number(),
  changePercent: z.number(),
  volume: z.number(),
  turnover: z.number(),
});

export const watchlistEntrySchema = z.object({
  userId: z.string(),
  symbol: z.string(),
  addedAt: z.string(),
  alertAbove: z.number().optional(),
  alertBelow: z.number().optional(),
  note: z.string().optional(),
});

export const notificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  channel: z.literal('dashboard'),
  title: z.string(),
  message: z.string(),
  symbol: z.string().optional(),
  createdAt: z.string(),
});
