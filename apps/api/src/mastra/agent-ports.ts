import { randomUUID } from 'node:crypto';
import type {
  AppNotification,
  CseDataSource,
  Notifier,
  WatchlistEntry,
  WatchlistStore,
} from '@sam-ai/tools';
import type { CseService } from '../cse/cse.service';

/** Adapts the Nest CseService to the data port the agent tools depend on. */
export function createCseDataSource(cse: CseService): CseDataSource {
  return {
    listSymbols: async () => cse.getSecurityMaster(),
    getSnapshot: (symbol) => cse.getCompanySnapshot(symbol),
    getHistory: (symbol, days) => cse.getHistoricalBars(symbol, days),
    getAnnouncements: async (symbol) => cse.getAnnouncements(symbol),
    getMarketSummary: () => cse.getMarketSummary(),
    getMarketIndexes: () => cse.getMarketIndexes(),
  };
}

/**
 * In-memory watchlist. Phase 1 only: data is lost on restart.
 * Phase 2 replaces this with a database-backed WatchlistStore.
 */
export class InMemoryWatchlistStore implements WatchlistStore {
  private readonly entries = new Map<string, Map<string, WatchlistEntry>>();

  async list(userId: string): Promise<WatchlistEntry[]> {
    return [...(this.entries.get(userId)?.values() ?? [])].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  async upsert(entry: WatchlistEntry): Promise<WatchlistEntry> {
    const forUser = this.entries.get(entry.userId) ?? new Map<string, WatchlistEntry>();
    const existing = forUser.get(entry.symbol);
    // Keep the original addedAt and any thresholds the update doesn't mention.
    const merged: WatchlistEntry = {
      ...existing,
      ...Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)),
      addedAt: existing?.addedAt ?? entry.addedAt,
    } as WatchlistEntry;
    forUser.set(entry.symbol, merged);
    this.entries.set(entry.userId, forUser);
    return merged;
  }

  async remove(userId: string, symbol: string): Promise<boolean> {
    return this.entries.get(userId)?.delete(symbol) ?? false;
  }
}

/** In-memory dashboard notifications (newest first, capped). Phase 1 only. */
export class InMemoryNotifier implements Notifier {
  private static readonly MAX_PER_USER = 100;
  private readonly byUser = new Map<string, AppNotification[]>();

  async notify(input: Omit<AppNotification, 'id' | 'createdAt' | 'channel'>): Promise<AppNotification> {
    const notification: AppNotification = {
      ...input,
      id: randomUUID(),
      channel: 'dashboard',
      createdAt: new Date().toISOString(),
    };
    const list = this.byUser.get(input.userId) ?? [];
    list.unshift(notification);
    this.byUser.set(input.userId, list.slice(0, InMemoryNotifier.MAX_PER_USER));
    return notification;
  }

  list(userId: string): AppNotification[] {
    return [...(this.byUser.get(userId) ?? [])];
  }
}
