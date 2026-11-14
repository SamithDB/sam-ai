import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import {
  CseAnalysisReport,
  CseAnnouncement,
  CseCompanySnapshot,
  CseHistoricalBar,
  CseIngestionResult,
  CseMarketIndex,
  CseMarketSummary,
  CseSecurityMaster,
} from './cse.types';

@Injectable()
export class CseService {
  private readonly logger = new Logger(CseService.name);
  private readonly apiBaseUrl: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    this.apiBaseUrl = config.get('CSE_API_BASE_URL', { infer: true });
  }

  private readonly securityMaster: CseSecurityMaster[] = [
    {
      symbol: 'JKH.N0000',
      companyId: 'JKH',
      companyName: 'John Keells Holdings PLC',
      sectorName: 'Diversified Holdings',
      instrumentType: 'equity',
      isActive: true,
    },
    {
      symbol: 'HNB.N0000',
      companyId: 'HNB',
      companyName: 'Hatton National Bank PLC',
      sectorName: 'Banking and Finance',
      instrumentType: 'equity',
      isActive: true,
    },
    {
      symbol: 'COMB.N0000',
      companyId: 'COMB',
      companyName: 'Commercial Bank of Ceylon PLC',
      sectorName: 'Banking and Finance',
      instrumentType: 'equity',
      isActive: true,
    },
  ];

  private readonly snapshotFixtures = new Map<string, CseCompanySnapshot>([
    [
      'JKH.N0000',
      {
        symbol: 'JKH.N0000',
        companyName: 'John Keells Holdings PLC',
        tradedDate: '2026-08-15',
        lastTradedPrice: 198.5,
        previousClose: 194.0,
        openPrice: 195.0,
        highPrice: 200.0,
        lowPrice: 193.5,
        changeValue: 4.5,
        changePercent: 2.32,
        volume: 1245000,
        turnover: 246820000,
        marketCap: 310000000000,
        beta: 0.91,
        foreignHoldings: 18.2,
        week52High: 212.0,
        week52Low: 148.0,
        ytdHigh: 206.0,
        ytdLow: 151.0,
        source: 'fixture',
      },
    ],
    [
      'HNB.N0000',
      {
        symbol: 'HNB.N0000',
        companyName: 'Hatton National Bank PLC',
        tradedDate: '2026-08-15',
        lastTradedPrice: 260.25,
        previousClose: 258.0,
        openPrice: 259.0,
        highPrice: 262.0,
        lowPrice: 257.0,
        changeValue: 2.25,
        changePercent: 0.87,
        volume: 780000,
        turnover: 203000000,
        marketCap: 420000000000,
        beta: 1.08,
        foreignHoldings: 12.8,
        week52High: 275.0,
        week52Low: 205.5,
        ytdHigh: 268.5,
        ytdLow: 206.0,
        source: 'fixture',
      },
    ],
    [
      'COMB.N0000',
      {
        symbol: 'COMB.N0000',
        companyName: 'Commercial Bank of Ceylon PLC',
        tradedDate: '2026-08-15',
        lastTradedPrice: 145.75,
        previousClose: 147.5,
        openPrice: 147.0,
        highPrice: 148.0,
        lowPrice: 144.9,
        changeValue: -1.75,
        changePercent: -1.19,
        volume: 950000,
        turnover: 139000000,
        marketCap: 205000000000,
        beta: 1.03,
        foreignHoldings: 9.6,
        week52High: 161.5,
        week52Low: 121.0,
        ytdHigh: 159.0,
        ytdLow: 124.5,
        source: 'fixture',
      },
    ],
  ]);

  private readonly marketSummaryFixture: CseMarketSummary = {
    tradedDate: '2026-08-15',
    advancers: 72,
    decliners: 58,
    unchanged: 19,
    totalTurnover: 1248000000,
    totalVolume: 18240000,
    marketStatus: 'Open',
  };

  private readonly marketIndexesFixture: CseMarketIndex[] = [
    {
      indexCode: 'ASPI',
      label: 'All Share Price Index',
      tradedDate: '2026-08-15',
      closeValue: 11242.18,
      changeValue: 64.81,
      changePercent: 0.58,
      volume: 0,
      turnover: 0,
    },
    {
      indexCode: 'SNP',
      label: 'S&P SL20',
      tradedDate: '2026-08-15',
      closeValue: 4018.62,
      changeValue: 22.34,
      changePercent: 0.56,
      volume: 0,
      turnover: 0,
    },
  ];

  private readonly announcementsFixture: CseAnnouncement[] = [
    {
      symbol: 'JKH.N0000',
      announcementId: 'ANN-001',
      announcementDate: '2026-08-14',
      title: 'Quarterly results update',
      summary: 'The company announced improved operating performance and stable cash flow.',
      category: 'Financial Results',
      url: 'https://www.cse.lk/',
    },
    {
      symbol: 'HNB.N0000',
      announcementId: 'ANN-002',
      announcementDate: '2026-08-13',
      title: 'Corporate disclosure',
      summary: 'The bank issued a market disclosure related to lending activity and capital position.',
      category: 'Disclosure',
      url: 'https://www.cse.lk/',
    },
  ];

  getSecurityMaster(): CseSecurityMaster[] {
    return [...this.securityMaster];
  }

  getSymbolLookup(symbol: string): CseSecurityMaster | undefined {
    const normalized = this.normalizeSymbol(symbol);
    return this.securityMaster.find((entry) => entry.symbol === normalized);
  }

  async getCompanySnapshot(symbol: string): Promise<CseCompanySnapshot> {
    const normalized = this.normalizeSymbol(symbol);
    if (this.apiBaseUrl) {
      return (await this.fetchLiveSnapshot(normalized)) ?? this.getFixtureSnapshot(normalized);
    }

    return this.getFixtureSnapshot(normalized);
  }

  async getHistoricalBars(symbol: string, days = 30): Promise<CseHistoricalBar[]> {
    return this.buildHistoricalBars(await this.getCompanySnapshot(symbol), days);
  }

  // Synthetic bars derived from the latest snapshot until a real history source is ingested.
  private buildHistoricalBars(snapshot: CseCompanySnapshot, days: number): CseHistoricalBar[] {
    const history: CseHistoricalBar[] = [];
    const baseClose = snapshot.lastTradedPrice;
    const trendBias = this.getTrendBias(snapshot.symbol);

    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(snapshot.tradedDate);
      date.setDate(date.getDate() - offset);
      const cycle = Math.sin((days - offset) / 3.5) * 0.8;
      const drift = trendBias * (days - offset - 1) * 0.12;
      const closePrice = this.roundPrice(baseClose - drift + cycle);
      const openPrice = this.roundPrice(closePrice - 0.35 + cycle * 0.1);
      const highPrice = this.roundPrice(Math.max(openPrice, closePrice) + 1.15);
      const lowPrice = this.roundPrice(Math.min(openPrice, closePrice) - 1.05);
      const volume = Math.max(100000, Math.round(snapshot.volume * (0.55 + ((days - offset) / days) * 0.22)));
      const turnover = Math.round(volume * closePrice);

      history.push({
        barDate: date.toISOString().slice(0, 10),
        openPrice,
        highPrice,
        lowPrice,
        closePrice,
        volume,
        turnover,
      });
    }

    return history;
  }

  async getMarketSummary(): Promise<CseMarketSummary> {
    if (this.apiBaseUrl) {
      return (await this.fetchLiveMarketSummary()) ?? { ...this.marketSummaryFixture };
    }

    return { ...this.marketSummaryFixture };
  }

  async getMarketIndexes(): Promise<CseMarketIndex[]> {
    if (this.apiBaseUrl) {
      return (await this.fetchLiveMarketIndexes()) ?? [...this.marketIndexesFixture];
    }

    return [...this.marketIndexesFixture];
  }

  getAnnouncements(symbol?: string): CseAnnouncement[] {
    const normalized = symbol ? this.normalizeSymbol(symbol) : undefined;
    const announcements = normalized
      ? this.announcementsFixture.filter((entry) => entry.symbol === normalized)
      : this.announcementsFixture;

    return [...announcements];
  }

  async getAnalysis(symbol: string): Promise<CseAnalysisReport> {
    const normalized = this.normalizeSymbol(symbol);
    const snapshot = await this.getCompanySnapshot(normalized);
    const history = this.buildHistoricalBars(snapshot, 30);
    const [marketSummary, marketIndexes] = await Promise.all([this.getMarketSummary(), this.getMarketIndexes()]);
    const announcements = this.getAnnouncements(normalized);
    const latestHistory = history.at(-1);
    const twentyDayAverage = this.getAverageClose(history.slice(-20));
    const fiveDayAverage = this.getAverageClose(history.slice(-5));

    const signals: string[] = [];
    const risks: string[] = [];

    if (latestHistory && latestHistory.closePrice > twentyDayAverage) {
      signals.push('Price is trading above the 20-day average, indicating positive medium-term momentum.');
    } else {
      risks.push('Price is not holding above the 20-day average, so momentum is still uncertain.');
    }

    if (fiveDayAverage > twentyDayAverage) {
      signals.push('The 5-day average is above the 20-day average, which is a short-term bullish sign.');
    } else {
      risks.push('The 5-day average is below the 20-day average, which weakens the short-term trend.');
    }

    if (snapshot.changePercent > 0) {
      signals.push('The latest snapshot shows a positive day-over-day move.');
    } else if (snapshot.changePercent < 0) {
      risks.push('The latest snapshot shows a negative day-over-day move.');
    }

    if (announcements.length > 0) {
      signals.push(`Latest announcement: ${announcements[0].title}.`);
    }

    const marketTone = marketSummary.advancers >= marketSummary.decliners ? 'broad market strength' : 'broad market weakness';
    const conclusion = `${snapshot.companyName} currently shows ${snapshot.changePercent >= 0 ? 'positive' : 'negative'} price action, while the wider market shows ${marketTone}. Use this as a structured research summary, not a trade recommendation.`;

    return {
      symbol: normalized,
      companyName: snapshot.companyName,
      snapshot,
      history,
      marketSummary,
      marketIndexes,
      announcements,
      signals,
      risks,
      conclusion,
      generatedAt: new Date().toISOString(),
      source: snapshot.source,
    };
  }

  ingestSymbols(): CseIngestionResult {
    return {
      jobName: 'symbol-master-sync',
      status: 'success',
      recordsInserted: this.securityMaster.length,
      recordsUpdated: 0,
      details: `Loaded ${this.securityMaster.length} stock symbols from the local CSE seed dataset.`,
      fetchedAt: new Date().toISOString(),
      source: 'fixture',
    };
  }

  ingestAll(): Record<string, CseIngestionResult> {
    return {
      symbols: this.ingestSymbols(),
      market: {
        jobName: 'market-context-sync',
        status: 'success',
        recordsInserted: this.marketIndexesFixture.length + 1,
        recordsUpdated: 0,
        details: 'Loaded daily market summary, market indexes, and announcement seeds.',
        fetchedAt: new Date().toISOString(),
        source: 'fixture',
      },
    };
  }

  private normalizeSymbol(value: string): string {
    const trimmed = value.trim().toUpperCase();
    if (!trimmed) {
      throw new BadRequestException('Symbol is required');
    }

    return trimmed.includes('.') ? trimmed : `${trimmed}.N0000`;
  }

  private getFixtureSnapshot(symbol: string): CseCompanySnapshot {
    const snapshot = this.snapshotFixtures.get(symbol);
    if (!snapshot) {
      const master = this.getSymbolLookup(symbol);
      if (!master) {
        throw new NotFoundException(`Unknown CSE symbol: ${symbol}`);
      }

      return this.buildFallbackSnapshot(master);
    }

    return { ...snapshot };
  }

  private buildFallbackSnapshot(symbol: CseSecurityMaster): CseCompanySnapshot {
    const basePrice = this.roundPrice(125 + this.getTrendBias(symbol.symbol) * 18 + symbol.companyName.length * 0.6);
    const previousClose = this.roundPrice(basePrice - 1.8);

    return {
      symbol: symbol.symbol,
      companyName: symbol.companyName,
      tradedDate: '2026-08-15',
      lastTradedPrice: basePrice,
      previousClose,
      openPrice: this.roundPrice(previousClose + 0.4),
      highPrice: this.roundPrice(basePrice + 1.6),
      lowPrice: this.roundPrice(basePrice - 1.9),
      changeValue: this.roundPrice(basePrice - previousClose),
      changePercent: this.roundPercent(((basePrice - previousClose) / previousClose) * 100),
      volume: 600000,
      turnover: Math.round(600000 * basePrice),
      marketCap: Math.round(basePrice * 1200000000),
      beta: 1,
      foreignHoldings: 10,
      week52High: this.roundPrice(basePrice * 1.12),
      week52Low: this.roundPrice(basePrice * 0.78),
      ytdHigh: this.roundPrice(basePrice * 1.08),
      ytdLow: this.roundPrice(basePrice * 0.82),
      source: 'fixture',
    };
  }

  private async fetchLiveSnapshot(symbol: string): Promise<CseCompanySnapshot | null> {
    const payload = await this.postForm('/companyInfoSummery', { symbol });
    if (!payload) {
      return null;
    }

    const companyName = this.pickString(payload, ['companyName', 'name', 'company']);
    const previousClose = this.pickNumber(payload, ['previousClose', 'prevClose', 'previous_close']);
    const lastTradedPrice = this.pickNumber(payload, ['lastTradedPrice', 'ltp', 'last_price', 'price', 'close']);

    if (!companyName || lastTradedPrice === undefined || previousClose === undefined) {
      this.logger.warn(`Live snapshot payload for ${symbol} did not contain expected fields; using fixture data.`);
      return null;
    }

    const openPrice = this.pickNumber(payload, ['openPrice', 'open']) ?? previousClose;
    const highPrice = this.pickNumber(payload, ['highPrice', 'high']) ?? lastTradedPrice;
    const lowPrice = this.pickNumber(payload, ['lowPrice', 'low']) ?? lastTradedPrice;
    const volume = this.pickNumber(payload, ['volume', 'qty']) ?? 0;
    const turnover = this.pickNumber(payload, ['turnover', 'value']) ?? Math.round(volume * lastTradedPrice);

    return {
      symbol,
      companyName,
      tradedDate: this.pickString(payload, ['tradedDate', 'date', 'marketDate']) ?? '2026-08-15',
      lastTradedPrice,
      previousClose,
      openPrice,
      highPrice,
      lowPrice,
      changeValue: this.pickNumber(payload, ['changeValue', 'change']) ?? this.roundPrice(lastTradedPrice - previousClose),
      changePercent: this.pickNumber(payload, ['changePercent', 'change_pct']) ?? this.roundPercent(((lastTradedPrice - previousClose) / previousClose) * 100),
      volume,
      turnover,
      marketCap: this.pickNumber(payload, ['marketCap', 'market_cap']) ?? 0,
      beta: this.pickNumber(payload, ['beta']) ?? 1,
      foreignHoldings: this.pickNumber(payload, ['foreignHoldings', 'foreign_holdings']) ?? 0,
      week52High: this.pickNumber(payload, ['week52High', 'high52']) ?? highPrice,
      week52Low: this.pickNumber(payload, ['week52Low', 'low52']) ?? lowPrice,
      ytdHigh: this.pickNumber(payload, ['ytdHigh']) ?? highPrice,
      ytdLow: this.pickNumber(payload, ['ytdLow']) ?? lowPrice,
      source: 'live',
    };
  }

  private async fetchLiveMarketSummary(): Promise<CseMarketSummary | null> {
    const payload = await this.postForm('/dailyMarketSummery', {});
    if (!payload) {
      return null;
    }

    const summary = this.pickObject(payload, ['data', 'summary', 'result']) ?? payload;
    const advancers = this.pickNumber(summary, ['advancers']) ?? this.marketSummaryFixture.advancers;
    const decliners = this.pickNumber(summary, ['decliners']) ?? this.marketSummaryFixture.decliners;
    const unchanged = this.pickNumber(summary, ['unchanged']) ?? this.marketSummaryFixture.unchanged;

    return {
      tradedDate: this.pickString(summary, ['tradedDate', 'date']) ?? this.marketSummaryFixture.tradedDate,
      advancers,
      decliners,
      unchanged,
      totalTurnover: this.pickNumber(summary, ['totalTurnover', 'turnover']) ?? this.marketSummaryFixture.totalTurnover,
      totalVolume: this.pickNumber(summary, ['totalVolume', 'volume']) ?? this.marketSummaryFixture.totalVolume,
      marketStatus: this.pickString(summary, ['marketStatus', 'status']) ?? this.marketSummaryFixture.marketStatus,
    };
  }

  private async fetchLiveMarketIndexes(): Promise<CseMarketIndex[] | null> {
    const [aspiPayload, snpPayload] = await Promise.all([
      this.postForm('/aspiData', {}),
      this.postForm('/snpData', {}),
    ]);

    if (!aspiPayload && !snpPayload) {
      return null;
    }

    const indexes = [...this.marketIndexesFixture];
    if (aspiPayload) {
      indexes[0] = this.normalizeIndexPayload('ASPI', 'All Share Price Index', aspiPayload, this.marketIndexesFixture[0]);
    }
    if (snpPayload) {
      indexes[1] = this.normalizeIndexPayload('SNP', 'S&P SL20', snpPayload, this.marketIndexesFixture[1]);
    }

    return indexes;
  }

  private normalizeIndexPayload(
    indexCode: 'ASPI' | 'SNP',
    label: string,
    payload: unknown,
    fallback: CseMarketIndex,
  ): CseMarketIndex {
    const record = this.pickObject(payload, ['data', 'summary', 'result']) ?? payload;

    return {
      indexCode,
      label,
      tradedDate: this.pickString(record, ['tradedDate', 'date']) ?? fallback.tradedDate,
      closeValue: this.pickNumber(record, ['closeValue', 'close', 'value']) ?? fallback.closeValue,
      changeValue: this.pickNumber(record, ['changeValue', 'change']) ?? fallback.changeValue,
      changePercent: this.pickNumber(record, ['changePercent', 'change_pct']) ?? fallback.changePercent,
      volume: this.pickNumber(record, ['volume']) ?? fallback.volume,
      turnover: this.pickNumber(record, ['turnover']) ?? fallback.turnover,
    };
  }

  private async postForm(endpoint: string, body: Record<string, string>): Promise<unknown | null> {
    if (!this.apiBaseUrl) {
      return null;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: new URLSearchParams(body),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      return (await response.json()) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Live CSE request for ${endpoint} failed: ${message}`);
      return null;
    }
  }

  private getAverageClose(bars: CseHistoricalBar[]): number {
    if (bars.length === 0) {
      return 0;
    }

    const total = bars.reduce((sum, bar) => sum + bar.closePrice, 0);
    return this.roundPrice(total / bars.length);
  }

  private getTrendBias(symbol: string): number {
    const seed = symbol
      .split('')
      .reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0);

    return ((seed % 5) - 2) / 10;
  }

  private roundPrice(value: number): number {
    return Number(value.toFixed(2));
  }

  private roundPercent(value: number): number {
    return Number(value.toFixed(2));
  }

  private pickString(payload: unknown, keys: string[]): string | undefined {
    const object = this.asRecord(payload);
    if (!object) {
      return undefined;
    }

    for (const key of keys) {
      const value = object[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return undefined;
  }

  private pickNumber(payload: unknown, keys: string[]): number | undefined {
    const object = this.asRecord(payload);
    if (!object) {
      return undefined;
    }

    for (const key of keys) {
      const value = object[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value.replace(/,/g, ''));
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return undefined;
  }

  private pickObject(payload: unknown, keys: string[]): Record<string, unknown> | undefined {
    const object = this.asRecord(payload);
    if (!object) {
      return undefined;
    }

    for (const key of keys) {
      const value = object[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }

    return undefined;
  }

  private asRecord(payload: unknown): Record<string, unknown> | undefined {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return undefined;
    }

    return payload as Record<string, unknown>;
  }
}