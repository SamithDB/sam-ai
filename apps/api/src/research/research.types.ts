/**
 * Mirror of research/src/cse_xai/export.py (SCHEMA_VERSION 1).
 * The Python pipeline is the single source of numbers; the app only reads summary.json.
 */

export const RESEARCH_SCHEMA_VERSION = 1;

export type MetricName = 'balanced_accuracy' | 'mcc' | 'macro_f1';

export interface MetricEstimate {
  mean: number;
  seed_sd: number;
  ci_lo: number;
  ci_hi: number;
}

export type ModelMetrics = {
  model: string;
  n_test: number;
  seeds: number;
} & Record<MetricName, MetricEstimate>;

export type BreakdownRow = {
  model: string;
  n: number;
  up_rate: number;
  fold?: number;
  regime?: string;
  symbol?: string;
} & Partial<Record<MetricName, number | null>>;

export interface ExperimentSummary {
  schema_version: number;
  name: string;
  /** Always 'real': experiments run on cse.lk data only. */
  kind: 'real';
  created_at: string;
  data: { symbols: string[]; test_start: string; test_end: string; n_test: number; up_rate: number };
  config: Record<string, unknown>;
  models: { id: string; label: string }[];
  folds: { fold: number; test_start: string; test_end: string }[];
  metrics: ModelMetrics[];
  by_fold: BreakdownRow[];
  by_regime: BreakdownRow[];
  by_symbol: BreakdownRow[];
}

export interface ExperimentListItem {
  name: string;
  kind: ExperimentSummary['kind'];
  created_at: string;
  test_start: string;
  test_end: string;
  n_test: number;
  models: string[];
  /** Model with the highest balanced accuracy, and whether its 95% CI excludes chance (0.5). */
  best: { model: string; balanced_accuracy: number; beats_chance: boolean } | null;
}
