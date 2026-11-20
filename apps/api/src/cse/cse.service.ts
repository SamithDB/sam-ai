import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { analyzeBars } from '@sam-ai/tools';
import type { Env } from '../config/env';
import { ResearchLiveService } from '../research/research-live.service';
import type {
  CseAnalysisReport,
  CseAnnouncement,
  CseCompanySnapshot,
  CseHistoricalBar,
  CseMarketIndex,
  CseMarketSummary,
  CseSector,
  CseSecurityMaster,
} from './cse.types';

/** Raw shapes of the public cse.lk endpoints (only the fields we use). */
interface TradeSummaryRow {
  symbol: string;
  name: string;
  price: number | null;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
  percentageChange: number | null;
  sharevolume: number | null;
  turnover: number | null;
  marketCap: number | null;
  lastTradedTime: number | null;
}
interface SymbolInfo {
  symbol: string;
  name: string;
  lastTradedPrice: number | null;
  previousClose: number | null;
  hiTrade: number | null;
  lowTrade: number | null;
  change: number | null;
  changePercentage: number | null;
  tdyShareVolume: number | null;
  tdyTurnover: number | null;
  marketCap: number | null;
  p12HiPrice: number | null;
  p12LowPrice: number | null;
  ytdHiPrice: number | null;
  ytdLowPrice: number | null;
}
interface IndexPoint {
  value: number;
  highValue: number | null;
  lowValue: number | null;
  change: number | null;
  percentage: number | null;
  timestamp: number | null;
}

const SOURCE = 'cse.lk (live)';
const COLOMBO_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const CACHE_MS = 60_000;
const ANNOUNCEMENT_CACHE_MS = 5 * 60_000;
const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const colomboDate = (ms: number | null | undefined): string | null =>
  typeof ms === 'number' && ms > 0 ? new Date(ms + COLOMBO_OFFSET_MS).toISOString().slice(0, 10) : null;
const colomboTime = (ms: number | null | undefined): string | null =>
  typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : null;
/** "13 Nov 2026" or "13 Nov 2026 08:55:29 PM" -> "2026-11-13". */
const parseDayMonthYear = (text: string | null | undefined): string | null => {
  const m = text?.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})/);
  const month = m ? MONTHS[m[2].toLowerCase()] : undefined;
  return m && month ? `${m[3]}-${month}-${m[1].padStart(2, '0')}` : null;
};

/**
 * Live Colombo Stock Exchange data from the public cse.lk endpoints, plus real daily history from the
 * research store. There is no sample or fallback data: when cse.lk cannot be reached the request fails
 * with 503, and a value cse.lk does not publish is returned as null.
 */
@Injectable()
export class CseService {
  private readonly logger = new Logger(CseService.name);
  private readonly apiBaseUrl: string;
  private readonly cache = new Map<string, { expires: number; value: Promise<unknown> }>();

  constructor(
    config: ConfigService<Env, true>,
    private readonly research: ResearchLiveService,
  ) {
    this.apiBaseUrl = config.get('CSE_API_BASE_URL', { infer: true }).replace(/\/+$/, '');
  }

  // ------------------------------------------------------------------ public API

  async getSecurityMaster(): Promise<CseSecurityMaster[]> {
    const rows = await this.tradeSummary();
    return rows
      .map((r) => ({
        symbol: r.symbol,
        companyId: r.symbol.split('.')[0],
        companyName: r.name,
        instrumentType: /\.[NX]\d{4}$/.test(r.symbol) ? ('equity' as const) : ('other' as const),
        lastTradedPrice: num(r.price),
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  async getCompanySnapshot(symbol: string): Promise<CseCompanySnapshot> {
    const normalized = this.normalizeSymbol(symbol);
    const [payload, rows] = await Promise.all([
      this.post<{ reqSymbolInfo?: SymbolInfo | null; reqSymbolBetaInfo?: Record<string, unknown> | null }>(
        'companyInfoSummery',
        { symbol: normalized },
      ),
      this.tradeSummary(),
    ]);
    const info = payload.reqSymbolInfo;
    const lastTradedPrice = num(info?.lastTradedPrice);
    if (!info || lastTradedPrice === null) {
      throw new NotFoundException(`Unknown CSE symbol or no price published: ${normalized}`);
    }
    const row = rows.find((r) => r.symbol === normalized);
    const beta = payload.reqSymbolBetaInfo ?? {};

    return {
      symbol: normalized,
      companyName: info.name,
      tradedDate: colomboDate(row?.lastTradedTime),
      lastTradedPrice,
      previousClose: num(info.previousClose),
      openPrice: num(row?.open) || null, // 0 means "no trade yet", not a price
      highPrice: num(info.hiTrade),
      lowPrice: num(info.lowTrade),
      changeValue: num(info.change),
      changePercent: num(info.changePercentage),
      volume: num(info.tdyShareVolume),
      turnover: num(info.tdyTurnover),
      marketCap: num(info.marketCap),
      betaAspi: num(beta['triASIBetaValue']),
      betaSpsl20: num(beta['betaValueSPSL']),
      week52High: num(info.p12HiPrice),
      week52Low: num(info.p12LowPrice),
      ytdHigh: num(info.ytdHiPrice),
      ytdLow: num(info.ytdLowPrice),
      source: SOURCE,
      fetchedAt: new Date().toISOString(),
    };
  }

  async getHistoricalBars(symbol: string, days = 60): Promise<{ bars: CseHistoricalBar[]; source: string }> {
    const res = await this.research.getBars(this.normalizeSymbol(symbol), days);
    return {
      source: res.source,
      bars: res.bars.map((b) => ({
        barDate: b.date,
        openPrice: b.open ?? null,
        highPrice: b.high ?? null,
        lowPrice: b.low ?? null,
        closePrice: b.close,
        volume: b.volume ?? null,
      })),
    };
  }

  async getMarketSummary(): Promise<CseMarketSummary> {
    const [summary, status, daily, rows] = await Promise.all([
      this.post<{ tradeDate?: number; tradeVolume?: number; shareVolume?: number; trades?: number }>('marketSummery'),
      this.post<{ status?: string }>('marketStatus'),
      this.post<unknown>('dailyMarketSummery'),
      this.tradeSummary(),
    ]);
    // dailyMarketSummery is a nested list; its first record holds the official company counts.
    const firstRecord = (v: unknown): Record<string, unknown> | undefined =>
      Array.isArray(v) ? firstRecord(v[0]) : v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
    const official = firstRecord(daily) ?? {};
    // Breadth: every security in the trade summary by its change vs the previous close.
    const change = (r: TradeSummaryRow) => num(r.change) ?? 0;
    return {
      tradedDate: colomboDate(summary.tradeDate),
      marketStatus: status.status ?? null,
      totalTurnover: num(summary.tradeVolume), // cse.lk names the turnover value "tradeVolume"
      totalShareVolume: num(summary.shareVolume),
      totalTrades: num(summary.trades),
      advancers: rows.filter((r) => change(r) > 0).length,
      decliners: rows.filter((r) => change(r) < 0).length,
      unchanged: rows.filter((r) => change(r) === 0).length,
      tradedCompanies: num(official['tradeCompanyNumber']),
      listedCompanies: num(official['listedCompanyNumber']),
    };
  }

  async getMarketIndexes(): Promise<CseMarketIndex[]> {
    const [aspi, spsl20] = await Promise.all([this.post<IndexPoint>('aspiData'), this.post<IndexPoint>('snpData')]);
    const toIndex = (indexCode: CseMarketIndex['indexCode'], label: string, p: IndexPoint): CseMarketIndex => {
      const value = num(p?.value);
      if (value === null) {
        throw new ServiceUnavailableException(`cse.lk returned no value for ${label}`);
      }
      return {
        indexCode,
        label,
        asOf: colomboTime(p.timestamp),
        value,
        high: num(p.highValue),
        low: num(p.lowValue),
        changeValue: num(p.change),
        changePercent: num(p.percentage),
      };
    };
    return [toIndex('ASPI', 'All Share Price Index', aspi), toIndex('SPSL20', 'S&P SL20', spsl20)];
  }

  async getSectors(): Promise<CseSector[]> {
    const rows = await this.cached('allSectors', CACHE_MS, () =>
      this.post<Record<string, unknown>[]>('allSectors'),
    );
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => num(r['indexValue']) !== null)
      .map((r) => ({
        name: String(r['name'] ?? ''),
        indexName: String(r['indexName'] ?? ''),
        value: num(r['indexValue']) as number,
        changeValue: num(r['change']),
        changePercent: num(r['percentage']),
        turnover: num(r['sectorTurnoverToday']),
        shareVolume: num(r['sectorVolumeToday']),
        trades: num(r['sectorTradeToday']),
      }));
  }

  /** Latest corporate announcements and financial filings, optionally for one company. */
  async getAnnouncements(symbol?: string): Promise<CseAnnouncement[]> {
    const all = await this.cached('announcements', ANNOUNCEMENT_CACHE_MS, () => this.fetchAnnouncements());
    if (!symbol) return all;
    const normalized = this.normalizeSymbol(symbol);
    const companyId = normalized.split('.')[0];
    return all.filter((a) => a.symbol === normalized || a.symbol?.split('.')[0] === companyId);
  }

  /** Snapshot + technical indicators on real stored history + market context + announcements. */
  async getAnalysis(symbol: string): Promise<CseAnalysisReport> {
    const normalized = this.normalizeSymbol(symbol);
    const [snapshot, history, marketSummary, marketIndexes, announcements] = await Promise.all([
      this.getCompanySnapshot(normalized),
      this.getHistoricalBars(normalized, 60),
      this.getMarketSummary(),
      this.getMarketIndexes(),
      this.getAnnouncements(normalized),
    ]);
    if (history.bars.length === 0) {
      throw new NotFoundException(`No stored daily history for ${normalized}`);
    }
    return {
      symbol: normalized,
      companyName: snapshot.companyName,
      snapshot,
      technical: analyzeBars(history.bars),
      barsSource: history.source,
      marketSummary,
      marketIndexes,
      announcements: announcements.slice(0, 10),
      generatedAt: new Date().toISOString(),
    };
  }

  // ------------------------------------------------------------------ helpers

  private tradeSummary(): Promise<TradeSummaryRow[]> {
    return this.cached('tradeSummary', CACHE_MS, async () => {
      const payload = await this.post<{ reqTradeSummery?: TradeSummaryRow[] }>('tradeSummary');
      if (!Array.isArray(payload.reqTradeSummery)) {
        throw new ServiceUnavailableException('cse.lk trade summary had an unexpected format');
      }
      return payload.reqTradeSummery;
    });
  }

  private async fetchAnnouncements(): Promise<CseAnnouncement[]> {
    const [approved, financial, securities] = await Promise.all([
      this.post<{ approvedAnnouncements?: Record<string, unknown>[] }>('approvedAnnouncement'),
      this.post<{ reqFinancialAnnouncemnets?: Record<string, unknown>[] }>('getFinancialAnnouncement'),
      this.getSecurityMaster(),
    ]);
    // Prefer the voting share when a company has several listed instruments.
    const pick = (candidates: CseSecurityMaster[]) =>
      (candidates.find((s) => s.symbol.endsWith('.N0000')) ?? candidates[0])?.symbol ?? null;
    const byName = (name: string) => pick(securities.filter((s) => s.companyName.toUpperCase() === name.toUpperCase()));
    const byTicker = (ticker: string) => pick(securities.filter((s) => s.companyId === ticker.toUpperCase()));

    const out: CseAnnouncement[] = [];
    for (const a of approved.approvedAnnouncements ?? []) {
      const date = parseDayMonthYear(a['dateOfAnnouncement'] as string);
      const company = String(a['company'] ?? '');
      if (!date || !company) continue;
      const rawSymbol = typeof a['symbol'] === 'string' ? (a['symbol'] as string) : null;
      out.push({
        announcementId: `approved-${a['announcementId'] ?? a['id']}`,
        announcementDate: date,
        company,
        symbol: rawSymbol ? (rawSymbol.includes('.') ? rawSymbol : byTicker(rawSymbol)) : byName(company),
        title: String(a['remarks'] ?? a['announcementCategory'] ?? 'Announcement'),
        category: String(a['announcementCategory'] ?? 'Announcement'),
        url: null,
      });
    }
    for (const f of financial.reqFinancialAnnouncemnets ?? []) {
      const date = parseDayMonthYear(f['uploadedDate'] as string);
      const path = typeof f['path'] === 'string' ? (f['path'] as string) : null;
      if (!date) continue;
      out.push({
        announcementId: `financial-${f['id']}`,
        announcementDate: date,
        company: String(f['name'] ?? ''),
        symbol: typeof f['symbol'] === 'string' ? byTicker(f['symbol'] as string) : null,
        title: String(f['fileText'] ?? 'Financial statement'),
        category: 'Financial Statements',
        // Verified pattern: filed documents are served from cdn.cse.lk/<path>.
        url: path ? `https://cdn.cse.lk/${encodeURI(path)}` : null,
      });
    }
    return out.sort((a, b) => b.announcementDate.localeCompare(a.announcementDate));
  }

  private cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
    const value = load();
    this.cache.set(key, { expires: Date.now() + ttlMs, value });
    value.catch(() => this.cache.delete(key)); // never cache a failure
    return value;
  }

  private async post<T>(endpoint: string, body: Record<string, string> = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.apiBaseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: 'application/json' },
        body: new URLSearchParams(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`cse.lk ${endpoint} unreachable: ${message}`);
      throw new ServiceUnavailableException(`Live CSE data is unavailable (cse.lk ${endpoint}: ${message})`);
    }
    if (response.status === 404 && body['symbol']) {
      throw new NotFoundException(`Unknown CSE symbol: ${body['symbol']}`);
    }
    if (!response.ok) {
      this.logger.warn(`cse.lk ${endpoint} returned HTTP ${response.status}`);
      throw new ServiceUnavailableException(`Live CSE data is unavailable (cse.lk ${endpoint}: HTTP ${response.status})`);
    }
    return (await response.json()) as T;
  }

  private normalizeSymbol(value: string): string {
    const trimmed = value.trim().toUpperCase();
    if (!trimmed) {
      throw new BadRequestException('Symbol is required');
    }
    return trimmed.includes('.') ? trimmed : `${trimmed}.N0000`;
  }
}
