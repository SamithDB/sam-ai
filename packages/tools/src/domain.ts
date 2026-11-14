// Domain types for Colombo Stock Exchange data, shared by the API and the agent tools.

export type CseSourceMode = 'fixture' | 'live';

export interface CseSecurityMaster {
  symbol: string;
  companyId: string;
  companyName: string;
  sectorName: string;
  instrumentType: 'equity' | 'index' | 'other';
  isActive: boolean;
}

export interface CseCompanySnapshot {
  symbol: string;
  companyName: string;
  tradedDate: string;
  lastTradedPrice: number;
  previousClose: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  changeValue: number;
  changePercent: number;
  volume: number;
  turnover: number;
  marketCap: number;
  beta: number;
  foreignHoldings: number;
  week52High: number;
  week52Low: number;
  ytdHigh: number;
  ytdLow: number;
  source: CseSourceMode;
}

export interface CseHistoricalBar {
  barDate: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number;
  turnover: number;
}

export interface CseMarketIndex {
  indexCode: 'ASPI' | 'SNP';
  label: string;
  tradedDate: string;
  closeValue: number;
  changeValue: number;
  changePercent: number;
  volume: number;
  turnover: number;
}

export interface CseMarketSummary {
  tradedDate: string;
  advancers: number;
  decliners: number;
  unchanged: number;
  totalTurnover: number;
  totalVolume: number;
  marketStatus: string;
}

export interface CseAnnouncement {
  symbol: string;
  announcementId: string;
  announcementDate: string;
  title: string;
  summary: string;
  category: string;
  url: string;
}

export interface CseAnalysisReport {
  symbol: string;
  companyName: string;
  snapshot: CseCompanySnapshot;
  history: CseHistoricalBar[];
  marketSummary: CseMarketSummary;
  marketIndexes: CseMarketIndex[];
  announcements: CseAnnouncement[];
  signals: string[];
  risks: string[];
  conclusion: string;
  generatedAt: string;
  source: CseSourceMode;
}

export interface CseIngestionResult {
  jobName: string;
  status: 'success' | 'partial' | 'failed';
  recordsInserted: number;
  recordsUpdated: number;
  details: string;
  fetchedAt: string;
  source: CseSourceMode;
}