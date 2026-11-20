import type {
  CseAnnouncement,
  CseCompanySnapshot,
  CseHistoricalBar,
  CseMarketIndex,
  CseMarketSummary,
  CseSector,
  CseSecurityMaster,
} from './domain';

/**
 * Ports the tools depend on. The host application (the Nest API) provides the
 * implementations, so this package never imports app code or talks to a DB directly.
 */
export interface CseDataSource {
  listSymbols(): Promise<CseSecurityMaster[]>;
  /** Accepts `JKH` or `JKH.N0000`; throws when the symbol is unknown or live data is unavailable. */
  getSnapshot(symbol: string): Promise<CseCompanySnapshot>;
  /** Real stored daily bars, oldest first, plus a description of where they came from. */
  getHistory(symbol: string, days: number): Promise<{ bars: CseHistoricalBar[]; source: string }>;
  getAnnouncements(symbol?: string): Promise<CseAnnouncement[]>;
  getMarketSummary(): Promise<CseMarketSummary>;
  getMarketIndexes(): Promise<CseMarketIndex[]>;
  /** Today's S&P/CSE sector index moves (cse.lk does not publish a company-to-sector mapping). */
  getSectors(): Promise<CseSector[]>;
}

export interface WatchlistEntry {
  userId: string;
  symbol: string;
  addedAt: string;
  alertAbove?: number;
  alertBelow?: number;
  note?: string;
}

export interface WatchlistStore {
  list(userId: string): Promise<WatchlistEntry[]>;
  upsert(entry: WatchlistEntry): Promise<WatchlistEntry>;
  remove(userId: string, symbol: string): Promise<boolean>;
}

export interface AppNotification {
  id: string;
  userId: string;
  channel: 'dashboard';
  title: string;
  message: string;
  symbol?: string;
  createdAt: string;
}

export interface Notifier {
  notify(notification: Omit<AppNotification, 'id' | 'createdAt' | 'channel'>): Promise<AppNotification>;
}

export interface CseToolDeps {
  data: CseDataSource;
  watchlist: WatchlistStore;
  notifier: Notifier;
}

/** Request-context key the host sets so per-user tools know who is calling. */
export const USER_ID_CONTEXT_KEY = 'userId';
export const ANONYMOUS_USER_ID = 'anonymous';
