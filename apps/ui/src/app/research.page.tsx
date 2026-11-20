import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { defaultApiBaseUrl } from './api-config';
import { LivePredictionsPanel, Stat } from './research-live.panel';
import styles from './research.page.module.scss';

// Mirrors apps/api/src/research/research.types.ts (summary.json schema v1).
type MetricName = 'balanced_accuracy' | 'mcc' | 'macro_f1';
type MetricEstimate = { mean: number; seed_sd: number; ci_lo: number; ci_hi: number };
type ModelMetrics = { model: string; n_test: number; seeds: number } & Record<MetricName, MetricEstimate>;
type BreakdownRow = { model: string; n: number; up_rate: number; fold?: number; regime?: string; symbol?: string } & Partial<
  Record<MetricName, number | null>
>;
type ExperimentSummary = {
  name: string;
  kind: 'real';
  created_at: string;
  data: { symbols: string[]; test_start: string; test_end: string; n_test: number; up_rate: number };
  config: { lookback?: number; seeds?: number[]; labels?: { zero_return?: string }; regimes?: { level?: string } };
  models: { id: string; label: string }[];
  folds: { fold: number; test_start: string; test_end: string }[];
  metrics: ModelMetrics[];
  by_fold: BreakdownRow[];
  by_regime: BreakdownRow[];
  by_symbol: BreakdownRow[];
};
type ExperimentListItem = {
  name: string;
  kind: 'real';
  created_at: string;
  test_start: string;
  test_end: string;
  n_test: number;
  best: { model: string; balanced_accuracy: number; beats_chance: boolean } | null;
};

const apiBaseUrl = defaultApiBaseUrl.replace(/\/$/, '');

const METRICS: Record<MetricName, { label: string; chance: number; min: number; max: number; hint: string }> = {
  balanced_accuracy: { label: 'Balanced accuracy', chance: 0.5, min: 0.3, max: 0.8, hint: '0.5 = chance' },
  mcc: { label: 'MCC', chance: 0, min: -0.3, max: 0.6, hint: '0 = chance' },
  macro_f1: { label: 'Macro-F1', chance: 0.5, min: 0.3, max: 0.8, hint: '≈0.5 for an informative coin flip' },
};

type BreakdownKey = 'fold' | 'regime' | 'symbol';
const BREAKDOWNS: Record<BreakdownKey, string> = { fold: 'Walk-forward fold', regime: 'Market regime', symbol: 'Stock' };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

const fmt = (v: number | null | undefined, digits = 3) => (v === null || v === undefined ? '–' : v.toFixed(digits));

export function ResearchPage() {
  const [experiments, setExperiments] = useState<ExperimentListItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [summary, setSummary] = useState<ExperimentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricName>('balanced_accuracy');
  const [breakdown, setBreakdown] = useState<BreakdownKey>('regime');

  const [reloadKey, setReloadKey] = useState(0);

  const loadExperiments = useCallback(() => {
    getJson<ExperimentListItem[]>('/research/experiments')
      .then((list) => {
        setExperiments(list);
        setSelected((cur) => (cur && list.some((e) => e.name === cur) ? cur : (list[0]?.name ?? null)));
        setReloadKey((k) => k + 1);
      })
      .catch((e: Error) => setError(`Could not load experiments: ${e.message}. Is the API running?`));
  }, []);

  useEffect(loadExperiments, [loadExperiments]);

  useEffect(() => {
    if (!selected) return;
    setSummary(null);
    getJson<ExperimentSummary>(`/research/experiments/${encodeURIComponent(selected)}`)
      .then(setSummary)
      .catch((e: Error) => setError(`Could not load ${selected}: ${e.message}`));
  }, [selected, reloadKey]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>MSc research · CSE stock direction</p>
          <h1>Research results</h1>
        </div>
        <nav className={styles.nav}>
          <Link to="/">Home</Link>
          <Link to="/chat">Assistant</Link>
          <Link to="/api-explorer">API explorer</Link>
        </nav>
      </header>

      <LivePredictionsPanel onRefreshed={loadExperiments} />

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.panel}>
        <h2>Experiments</h2>
        {experiments === null && !error && <p className={styles.muted}>Loading…</p>}
        {experiments?.length === 0 && (
          <p className={styles.muted}>
            No results yet. Run <code>python scripts/run_experiment.py configs/dev_1y.yaml</code> in <code>research/</code>.
          </p>
        )}
        <div className={styles.expList}>
          {experiments?.map((e) => (
            <button
              key={e.name}
              type="button"
              className={`${styles.expCard} ${e.name === selected ? styles.expCardActive : ''}`}
              onClick={() => setSelected(e.name)}
            >
              <span className={styles.expName}>{e.name}</span>
              <span className={styles.badgeReal}>real data</span>
              <span className={styles.muted}>
                {e.test_start} → {e.test_end} · {e.n_test} test rows
              </span>
              {e.best && (
                <span className={styles.muted}>
                  Best: {e.best.model} {fmt(e.best.balanced_accuracy)} {e.best.beats_chance ? '(beats chance)' : '(CI includes chance)'}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {selected && !summary && !error && <p className={styles.muted}>Loading {selected}…</p>}
      {summary && (
        <ExperimentView
          summary={summary}
          metric={metric}
          onMetric={setMetric}
          breakdown={breakdown}
          onBreakdown={setBreakdown}
        />
      )}
    </div>
  );
}

function ExperimentView(props: {
  summary: ExperimentSummary;
  metric: MetricName;
  onMetric: (m: MetricName) => void;
  breakdown: BreakdownKey;
  onBreakdown: (b: BreakdownKey) => void;
}) {
  const { summary: s, metric, breakdown } = props;
  const labelOf = useMemo(() => Object.fromEntries(s.models.map((m) => [m.id, m.label])), [s.models]);
  const m = METRICS[metric];

  return (
    <>
      <section className={styles.panel}>
        <h2>{s.name}</h2>
        <div className={styles.stats}>
          <Stat label="Test period" value={`${s.data.test_start} → ${s.data.test_end}`} />
          <Stat label="Test predictions" value={String(s.data.n_test)} />
          <Stat label="Up-day share" value={`${(100 * s.data.up_rate).toFixed(1)}%`} />
          <Stat label="Stocks" value={String(s.data.symbols.length)} />
          <Stat label="Folds" value={String(s.folds.length)} />
          <Stat label="Seeds" value={String(s.config.seeds?.length ?? 1)} />
        </div>
        <p className={styles.muted}>
          {s.data.symbols.join(', ')} · look-back {s.config.lookback ?? '?'} days · unchanged days:{' '}
          {s.config.labels?.zero_return ?? '?'} · regimes per {s.config.regimes?.level ?? '?'}
        </p>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Out-of-sample performance</h2>
          <div className={styles.segmented} role="tablist">
            {(Object.keys(METRICS) as MetricName[]).map((k) => (
              <button key={k} type="button" aria-pressed={k === metric} onClick={() => props.onMetric(k)}>
                {METRICS[k].label}
              </button>
            ))}
          </div>
        </div>
        <p className={styles.muted}>
          Dot = mean over seeds; bar = 95% block-bootstrap CI; dashed line = chance ({m.hint}). A model shows skill only
          if its whole bar sits to the right of the line.
        </p>
        <div className={styles.forest}>
          {s.metrics.map((row) => {
            const est = row[metric];
            const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - m.min) / (m.max - m.min)) * 100))}%`;
            const beats = est.ci_lo > m.chance;
            return (
              <div key={row.model} className={styles.forestRow}>
                <span className={styles.forestLabel}>{labelOf[row.model] ?? row.model}</span>
                <div className={styles.forestTrack}>
                  <span className={styles.chanceLine} style={{ left: pos(m.chance) }} />
                  <span
                    className={`${styles.ciBar} ${beats ? styles.ciBarSkill : ''}`}
                    style={{ left: pos(est.ci_lo), width: `calc(${pos(est.ci_hi)} - ${pos(est.ci_lo)})` }}
                  />
                  <span className={`${styles.dot} ${beats ? styles.dotSkill : ''}`} style={{ left: pos(est.mean) }} />
                </div>
                <span className={styles.forestValue}>
                  {fmt(est.mean)} <small>[{fmt(est.ci_lo)}, {fmt(est.ci_hi)}]</small>
                </span>
              </div>
            );
          })}
          <div className={styles.forestAxis}>
            <span>{m.min}</span>
            <span>{m.max}</span>
          </div>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Model</th>
              <th>Seeds</th>
              {(Object.keys(METRICS) as MetricName[]).map((k) => (
                <th key={k}>{METRICS[k].label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.metrics.map((row) => (
              <tr key={row.model}>
                <td>{labelOf[row.model] ?? row.model}</td>
                <td>{row.seeds}</td>
                {(Object.keys(METRICS) as MetricName[]).map((k) => (
                  <td key={k}>
                    {fmt(row[k].mean)}
                    {row.seeds > 1 && <small> ±{fmt(row[k].seed_sd)}</small>}
                    <br />
                    <small className={styles.muted}>
                      [{fmt(row[k].ci_lo)}, {fmt(row[k].ci_hi)}]
                    </small>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>{METRICS[metric].label} by {BREAKDOWNS[breakdown].toLowerCase()}</h2>
          <div className={styles.segmented} role="tablist">
            {(Object.keys(BREAKDOWNS) as BreakdownKey[]).map((k) => (
              <button key={k} type="button" aria-pressed={k === breakdown} onClick={() => props.onBreakdown(k)}>
                {BREAKDOWNS[k]}
              </button>
            ))}
          </div>
        </div>
        <Breakdown summary={s} metric={metric} by={breakdown} labelOf={labelOf} />
      </section>
    </>
  );
}

function Breakdown(props: { summary: ExperimentSummary; metric: MetricName; by: BreakdownKey; labelOf: Record<string, string> }) {
  const { summary: s, metric, by, labelOf } = props;
  const rows = s[`by_${by}` as const];
  const m = METRICS[metric];
  const keys = [...new Set(rows.map((r) => String(r[by])))].sort((a, b) =>
    by === 'fold' ? Number(a) - Number(b) : a.localeCompare(b),
  );
  const cell = (model: string, key: string) => rows.find((r) => r.model === model && String(r[by]) === key);
  const nFor = (key: string) => rows.find((r) => String(r[by]) === key)?.n;
  const foldLabel = (key: string) => {
    const f = s.folds.find((x) => String(x.fold) === key);
    return f ? `${f.test_start.slice(5)}→${f.test_end.slice(5)}` : key;
  };

  const colour = (v: number | null | undefined) => {
    if (v === null || v === undefined) return undefined;
    const span = (m.max - m.min) / 2;
    const t = Math.max(-1, Math.min(1, (v - m.chance) / span));
    return t >= 0 ? `rgba(22, 163, 74, ${0.08 + 0.6 * t})` : `rgba(220, 38, 38, ${0.08 + 0.6 * -t})`;
  };

  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Model</th>
            {keys.map((k) => (
              <th key={k}>
                {by === 'fold' ? `Fold ${k}` : k.replace('.N0000', '')}
                <br />
                <small className={styles.muted}>{by === 'fold' ? foldLabel(k) : `n=${nFor(k)}`}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.models.map(({ id }) => (
            <tr key={id}>
              <td>{labelOf[id] ?? id}</td>
              {keys.map((k) => {
                const v = cell(id, k)?.[metric];
                return (
                  <td key={k} style={{ background: colour(v) }}>
                    {fmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.muted}>
        Green = better than chance, red = worse. These are point estimates without confidence intervals: small cells
        (low n) are noisy and should not be over-interpreted.
      </p>
    </div>
  );
}

export default ResearchPage;
