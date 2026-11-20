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
  instrumentType: z.enum(['equity', 'other']),
  lastTradedPrice: z.number().nullable(),
});

const num = z.number().nullable();

export const snapshotSchema = z.object({
  symbol: z.string(),
  companyName: z.string(),
  tradedDate: z.string().nullable(),
  lastTradedPrice: z.number(),
  previousClose: num,
  openPrice: num,
  highPrice: num,
  lowPrice: num,
  changeValue: num,
  changePercent: num,
  volume: num,
  turnover: num,
  marketCap: num,
  betaAspi: num,
  betaSpsl20: num,
  week52High: num,
  week52Low: num,
  ytdHigh: num,
  ytdLow: num,
  source: z.string(),
  fetchedAt: z.string(),
});

export const barSchema = z.object({
  barDate: z.string(),
  openPrice: num,
  highPrice: num,
  lowPrice: num,
  closePrice: z.number(),
  volume: num,
});

export const announcementSchema = z.object({
  announcementId: z.string(),
  announcementDate: z.string(),
  company: z.string(),
  symbol: z.string().nullable(),
  title: z.string(),
  category: z.string(),
  url: z.string().nullable(),
});

export const marketSummarySchema = z.object({
  tradedDate: z.string().nullable(),
  marketStatus: z.string().nullable(),
  totalTurnover: num,
  totalShareVolume: num,
  totalTrades: num,
  advancers: z.number(),
  decliners: z.number(),
  unchanged: z.number(),
  tradedCompanies: num,
  listedCompanies: num,
});

export const marketIndexSchema = z.object({
  indexCode: z.enum(['ASPI', 'SPSL20']),
  label: z.string(),
  asOf: z.string().nullable(),
  value: z.number(),
  high: num,
  low: num,
  changeValue: num,
  changePercent: num,
});

export const sectorSchema = z.object({
  name: z.string(),
  indexName: z.string(),
  value: z.number(),
  changeValue: num,
  changePercent: num,
  turnover: num,
  shareVolume: num,
  trades: num,
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
