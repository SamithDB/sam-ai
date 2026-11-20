import { HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  DataStatusResponse,
  PredictionDetailResponse,
  PredictionOverviewResponse,
} from '@sam-ai/tools';
import type { Env } from '../config/env';

/**
 * Client for the Python research service (research/src/cse_xai/service.py), which owns the
 * data sync (cse.lk -> MongoDB) and the live predictions/explanations. The browser only talks to Nest.
 */
@Injectable()
export class ResearchLiveService {
  private readonly logger = new Logger(ResearchLiveService.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('RESEARCH_SERVICE_URL', { infer: true }).replace(/\/+$/, '');
  }

  getDataStatus() {
    return this.request<DataStatusResponse>('GET', '/data/status');
  }

  startSync(options: { refresh?: boolean; force?: boolean } = {}) {
    const q = new URLSearchParams({ refresh: String(options.refresh ?? true), force: String(options.force ?? false) });
    return this.request<{ started: boolean; job: unknown }>('POST', `/sync?${q}`);
  }

  startRefresh(force = false) {
    return this.request<{ started: boolean; job: unknown }>('POST', `/refresh?force=${force}`);
  }

  getCurrentJob() {
    return this.request<unknown>('GET', '/jobs/current');
  }

  listPredictions() {
    return this.request<PredictionOverviewResponse>('GET', '/predictions');
  }

  /** Real stored daily bars (oldest first). The service fetches and stores a symbol it does not have yet. */
  getBars(symbol: string, days: number) {
    return this.request<{
      symbol: string;
      source: string;
      fetched_now: boolean;
      bars: { date: string; open: number | null; high: number | null; low: number | null; close: number; volume: number | null }[];
    }>('GET', `/bars/${encodeURIComponent(symbol.trim())}?days=${days}`);
  }

  getPrediction(symbol: string) {
    return this.request<PredictionDetailResponse>('GET', `/predictions/${encodeURIComponent(symbol.trim())}`);
  }

  private async request<T>(method: 'GET' | 'POST', path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { method, signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      this.logger.warn(`Research service unreachable at ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException(
        `The research service is not running at ${this.baseUrl}. Start it with: ` +
          'cd research && .venv\\Scripts\\activate && python -m uvicorn cse_xai.service:app --port 8001',
      );
    }
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    if (!res.ok) {
      const detail = typeof body?.detail === 'string' ? body.detail : `Research service returned HTTP ${res.status}`;
      throw new HttpException(detail, res.status);
    }
    return body as T;
  }
}
