/**
 * Shapes returned by the Python research service (research/src/cse_xai/service.py, live.py).
 * Snapshot schema_version 1. Keep in sync with live.py.
 */

export interface CiValue {
  mean: number | null;
  ci_lo: number | null;
  ci_hi: number | null;
}

export interface ConfidenceBucket {
  lo: number;
  hi: number;
  n: number;
  accuracy: number | null;
}

export interface ModelPrediction {
  model: string;
  label: string;
  prob_up: number | null;
  seed_sd: number | null;
  n_seeds: number;
  direction: 'up' | 'down';
  oos_balanced_accuracy?: CiValue;
  beats_chance?: boolean;
  regime_balanced_accuracy?: number | null;
  regime_n?: number | null;
  symbol_balanced_accuracy?: number | null;
  symbol_n?: number | null;
  confidence_bucket?: ConfidenceBucket | null;
}

export interface FeatureAttribution {
  feature: string;
  group: string;
  description: string;
  value: number | null;
  phi: number | null;
}

export interface ModelExplanation {
  model: string;
  label: string;
  prob_up: number | null;
  baseline_prob: number | null;
  features: FeatureAttribution[];
  groups: { group: string; phi: number | null }[];
  time_blocks: { block: string; phi: number | null }[];
}

export interface ExplanationReliability {
  seed_stability: number | null;
  temporal_stability: number | null;
  robustness: number | null;
  faithfulness_ratio: number | null;
}

export interface StockPrediction {
  symbol: string;
  as_of: string;
  last_close: number | null;
  target: string;
  regime: { label: string; trend: string; volatility: string };
  consensus: { prob_up: number | null; direction: 'up' | 'down'; models_up: number; n_models: number; method: string };
  recommended_model: string;
  models: ModelPrediction[];
  explanations: ModelExplanation[];
  reliability: { by_model: Record<string, ExplanationReliability>; model_agreement: number | null };
  caveats: string[];
}

export interface SnapshotData {
  symbols: string[];
  first_date: string;
  last_date: string;
  n_days: number;
}

export interface PredictionDetailResponse {
  schema_version: number;
  created_at: string;
  config: string;
  evaluation_experiment: string;
  data: SnapshotData;
  methods: Record<string, string>;
  data_version: string;
  prediction: StockPrediction;
}

export interface PredictionOverviewRow {
  symbol: string;
  as_of: string;
  last_close: number | null;
  regime: StockPrediction['regime'];
  consensus: StockPrediction['consensus'];
  recommended_model: string;
  recommended: ModelPrediction | null;
  models: { model: string; prob_up: number | null; direction: 'up' | 'down' }[];
}

export interface ModelEvaluation {
  n_test: number;
  balanced_accuracy: CiValue;
  beats_chance: boolean;
  by_regime: Record<string, { n: number; balanced_accuracy: number | null }>;
  confidence_buckets: ConfidenceBucket[];
}

export interface PredictionOverviewResponse {
  schema_version: number;
  created_at: string;
  as_of: string;
  config: string;
  evaluation_experiment: string;
  data: SnapshotData;
  recommended_model: string;
  evaluation: Record<string, ModelEvaluation>;
  data_version: string;
  predictions: PredictionOverviewRow[];
  /** Symbols with no prediction because a value in their latest input window is missing at the source. */
  unavailable: { symbol: string; as_of: string; reason: string }[];
}

export interface CoverageRow {
  key: string;
  count: number;
  first: string;
  last: string;
  last_fetched_at: string | null;
}

export interface JobSummary {
  id: string;
  kind: 'sync' | 'refresh';
  status: 'running' | 'succeeded' | 'failed';
  stage: string;
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

export interface DataStatusResponse {
  config: string;
  symbols: string[];
  indexes: string[];
  coverage: { stocks: CoverageRow[]; indexes: CoverageRow[]; revisions: number };
  missing_symbols: string[];
  data_version: string;
  snapshot: { created_at: string; as_of: string; data_version: string; config: string; stale: boolean } | null;
  job: JobSummary | null;
}

/** Compact experiment entry from research/results/<name>/summary.json. */
export interface ResearchExperimentItem {
  name: string;
  kind: 'real';
  created_at: string;
  test_start: string;
  test_end: string;
  n_test: number;
  models: string[];
  best: { model: string; balanced_accuracy: number; beats_chance: boolean } | null;
}

/** Port the research tools depend on; the Nest API implements it. */
export interface ResearchPort {
  listExperiments(): Promise<ResearchExperimentItem[]>;
  /** Full summary.json of one experiment. */
  getExperiment(name: string): Promise<{
    name: string;
    kind: string;
    data: Record<string, unknown>;
    metrics: { model: string; n_test: number; balanced_accuracy: CiValue; mcc: CiValue; macro_f1: CiValue }[];
    by_regime: { model: string; regime?: string; key?: string; n: number; balanced_accuracy?: number | null }[];
  }>;
  getDataStatus(): Promise<DataStatusResponse>;
  listPredictions(): Promise<PredictionOverviewResponse>;
  getPrediction(symbol: string): Promise<PredictionDetailResponse>;
}
