// Domain types for Colombo Stock Exchange data, shared by the API and the agent tools.
// Every value comes from a real source (the public cse.lk endpoints, or daily bars stored in MongoDB).
// A field the source does not publish is null; nothing is estimated or filled in.

import type { TechnicalSummary } from './indicators';

export interface CseSecurityMaster {
  symbol: string;
  /** Ticker without the share-class suffix, e.g. "JKH" for "JKH.N0000". */
  companyId: string;
  companyName: string;
  /** N = voting ordinary shares, X = non-voting; anything else (debentures, rights, warrants...) is "other". */
  instrumentType: 'equity' | 'other';
  lastTradedPrice: number | null;
}

export interface CseCompanySnapshot {
  symbol: string;
  companyName: string;
  /** Colombo date of the last trade; null if the stock has not traded in the current session data. */
  tradedDate: string | null;
  lastTradedPrice: number;
  previousClose: number | null;
  openPrice: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  changeValue: number | null;
  changePercent: number | null;
  volume: number | null;
  turnover: number | null;
  marketCap: number | null;
  betaAspi: number | null;
  betaSpsl20: number | null;
  week52High: number | null;
  week52Low: number | null;
  ytdHigh: number | null;
  ytdLow: number | null;
  source: string;
  fetchedAt: string;
}

/** One stored daily bar. cse.lk does not publish the daily open, so openPrice is usually null. */
export interface CseHistoricalBar {
  barDate: string;
  openPrice: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  closePrice: number;
  volume: number | null;
}

export interface CseMarketIndex {
  indexCode: 'ASPI' | 'SPSL20';
  label: string;
  asOf: string | null;
  value: number;
  high: number | null;
  low: number | null;
  changeValue: number | null;
  changePercent: number | null;
}

export interface CseMarketSummary {
  tradedDate: string | null;
  marketStatus: string | null;
  totalTurnover: number | null;
  totalShareVolume: number | null;
  totalTrades: number | null;
  /** Securities in the cse.lk trade summary whose price is up / down / unchanged vs the previous close. */
  advancers: number;
  decliners: number;
  unchanged: number;
  /** Official counts from cse.lk's daily market summary. */
  tradedCompanies: number | null;
  listedCompanies: number | null;
}

export interface CseSector {
  name: string;
  indexName: string;
  value: number;
  changeValue: number | null;
  changePercent: number | null;
  turnover: number | null;
  shareVolume: number | null;
  trades: number | null;
}

export interface CseAnnouncement {
  announcementId: string;
  /** ISO date (YYYY-MM-DD). */
  announcementDate: string;
  company: string;
  /** Full symbol when it can be matched to a listed security, else null. */
  symbol: string | null;
  title: string;
  category: string;
  /** Link to the filed document when cse.lk provides one. */
  url: string | null;
}

export interface CseAnalysisReport {
  symbol: string;
  companyName: string;
  snapshot: CseCompanySnapshot;
  technical: TechnicalSummary;
  barsSource: string;
  marketSummary: CseMarketSummary;
  marketIndexes: CseMarketIndex[];
  announcements: CseAnnouncement[];
  generatedAt: string;
}
