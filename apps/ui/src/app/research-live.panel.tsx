import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { defaultApiBaseUrl } from './api-config';
import styles from './research.page.module.scss';

// Mirrors packages/tools/src/research-types.ts (Python research service, snapshot schema v1).
type Direction = 'up' | 'down';
type CiValue = { mean: number | null; ci_lo: number | null; ci_hi: number | null };
type CoverageRow = { key: string; count: number; first: string; last: string; last_fetched_at: string | null };
type Job = {
  id: string;
  kind: string;
  status: 'running' | 'succeeded' | 'failed';
  stage: string;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  log?: string[];
  sync_report?: { totals: Record<'fetched' | 'inserted' | 'refreshed' | 'revised', number>; errors: number } | null;
  refresh_result?: { skipped: boolean; as_of?: string; elapsed_s?: number } | null;
};
type DataStatus = {
  symbols: string[];
  coverage: { stocks: CoverageRow[]; indexes: CoverageRow[]; revisions: number };
  missing_symbols: string[];
  snapshot: { created_at: string; as_of: string; stale: boolean } | null;
  job: Job | null;
};
type OverviewRow = {
  symbol: string;
  as_of: string;
  last_close: number | null;
  regime: { label: string };
  consensus: { prob_up: number | null; direction: Direction; models_up: number; n_models: number };
  recommended_model: string;
  recommended: { prob_up: number | null; seed_sd: number | null } | null;
};
type Overview = {
  created_at: string;
  as_of: string;
  recommended_model: string;
  evaluation: Record<string, { balanced_accuracy: CiValue; beats_chance: boolean; n_test: number }>;
  predictions: OverviewRow[];
  unavailable?: { symbol: string; as_of: string; reason: string }[];
};
type Explanation = {
  model: string;
  label: string;
  prob_up: number | null;
  baseline_prob: number | null;
  features: { feature: string; description: string; value: number | null; phi: number | null }[];
  time_blocks: { block: string; phi: number | null }[];
};
type Reliability = {
  seed_stability: number | null;
  temporal_stability: number | null;
  robustness: number | null;
  faithfulness_ratio: number | null;
};
type Detail = {
  prediction: {
    symbol: string;
    recommended_model: string;
    models: { model: string; label: string; prob_up: number | null; seed_sd: number | null; direction: Direction }[];
    explanations: Explanation[];
    reliability: { by_model: Record<string, Reliability>; model_agreement: number | null };
    caveats: string[];
  };
};

const apiBaseUrl = defaultApiBaseUrl.replace(/\/$/, '');
const MODEL_LABELS: Record<string, string> = {
  logreg: 'Logistic Regression',
  random_forest: 'Random Forest',
  lstm: 'LSTM',
  patchtst: 'PatchTST',
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string }).message ?? `${res.status} ${res.statusText}`);
  return body as T;
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${(100 * v).toFixed(1)}%`);
const num = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? '–' : v.toFixed(d));
const short = (s: string) => s.replace('.N0000', '');

export function LivePredictionsPanel({ onRefreshed }: { onRefreshed: () => void }) {
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const wasRunning = useRef(false);

  const load = useCallback(async () => {
    try {
      const st = await api<DataStatus>('/research/live/status');
      setStatus(st);
      setError(null);
      // The status endpoint returns the job without its log; keep a log we already polled for the same job.
      if (st.job) setJob((j) => (j && j.id === st.job?.id && j.log ? { ...j, ...st.job } : st.job));
      if (st.snapshot) setOverview(await api<Overview>('/research/live/predictions'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll the job while it runs; reload everything once it finishes.
  const running = job?.status === 'running';
  useEffect(() => {
    if (!running) {
      if (wasRunning.current) {
        wasRunning.current = false;
        void load();
        onRefreshed();
      }
      return;
    }
    wasRunning.current = true;
    const t = setInterval(() => {
      api<Job>('/research/live/job')
        .then(setJob)
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(t);
  }, [running, load, onRefreshed]);

  const sync = async (force = false) => {
    try {
      const res = await api<{ job: Job }>(`/research/live/sync?refresh=true&force=${force}`, { method: 'POST' });
      setJob(res.job);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const stocks = status?.coverage.stocks.filter((r) => status.symbols.includes(r.key)) ?? [];
  const first = stocks.map((r) => r.first).sort()[0];
  const last = stocks.map((r) => r.last).sort().at(-1);
  const anyBeatsChance = overview && Object.values(overview.evaluation).some((e) => e.beats_chance);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>Live predictions</h2>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryBtn} disabled={running} onClick={() => void sync(false)}>
            {running ? 'Syncing…' : 'Sync data'}
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={running || !status?.coverage.stocks.length}
            title="Retrain and re-explain even if no new data arrived"
            onClick={() => void sync(true)}
          >
            Rebuild
          </button>
        </div>
      </div>
      <p className={styles.muted}>
        Sync fetches the free one-year history from cse.lk, stores only the trading days the database is missing, then
        re-runs the walk-forward evaluation, retrains the models and explains the next-day predictions. Stored days are
        kept, so syncing regularly builds a longer history over time.
      </p>

      {error && <div className={styles.error}>{error}</div>}

      {status && (
        <div className={styles.stats}>
          <Stat label="Stocks stored" value={`${stocks.length} / ${status.symbols.length}`} />
          <Stat label="Stored range" value={first ? `${first} → ${last}` : '–'} />
          <Stat label="Days per stock" value={stocks.length ? String(Math.max(...stocks.map((r) => r.count))) : '–'} />
          <Stat label="Indexes" value={status.coverage.indexes.map((r) => `${r.key.toUpperCase()} ${r.count}`).join(' · ') || '–'} />
          <Stat
            label="Predictions built"
            value={status.snapshot ? `${status.snapshot.created_at.slice(0, 16).replace('T', ' ')}${status.snapshot.stale ? ' (stale)' : ''}` : 'never'}
          />
        </div>
      )}

      {job && (
        <div className={`${styles.job} ${styles[`job_${job.status}`]}`}>
          <strong>
            {job.status === 'running' ? `Running: ${job.stage}…` : job.status === 'succeeded' ? 'Last sync succeeded' : 'Last sync failed'}
          </strong>
          {job.sync_report && (
            <span>
              {job.sync_report.totals.inserted} new days stored · {job.sync_report.totals.refreshed} refreshed ·{' '}
              {job.sync_report.totals.revised} source revisions kept for audit
              {job.sync_report.errors ? ` · ${job.sync_report.errors} errors` : ''}
            </span>
          )}
          {job.refresh_result && (
            <span>
              {job.refresh_result.skipped ? 'No new data, predictions already up to date' : `Predictions rebuilt in ${job.refresh_result.elapsed_s}s`}
            </span>
          )}
          {job.error && <span>{job.error}</span>}
          {job.log && job.log.length > 0 && (
            <button type="button" className={styles.linkBtn} onClick={() => setShowLog((v) => !v)}>
              {showLog ? 'Hide log' : 'Show log'}
            </button>
          )}
          {showLog && job.log && <pre className={styles.log}>{job.log.slice(-40).join('\n')}</pre>}
        </div>
      )}

      {overview && (
        <>
          {!anyBeatsChance && (
            <div className={styles.warning}>
              No model beats chance out-of-sample on the stored data (every 95% CI includes 0.5). Predictions and
              explanations are shown to demonstrate the method, not as a usable signal.
            </div>
          )}
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>As of</th>
                  <th>Close</th>
                  <th>Regime</th>
                  <th>Consensus P(up)</th>
                  <th>Models up</th>
                  <th>{MODEL_LABELS[overview.recommended_model] ?? overview.recommended_model} P(up)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {overview.predictions.map((p) => (
                  <PredictionRow key={p.symbol} row={p} open={open === p.symbol} onToggle={() => setOpen(open === p.symbol ? null : p.symbol)} />
                ))}
              </tbody>
            </table>
          </div>
          {overview.unavailable && overview.unavailable.length > 0 && (
            <p className={styles.muted}>
              No prediction for {overview.unavailable.map((u) => short(u.symbol)).join(', ')}: a value in the latest
              20-day input window is missing at the source, and missing values are never filled in.
            </p>
          )}
          <p className={styles.muted}>
            Predicts whether the next trading day's close is above the as-of close. Recommended model = best out-of-sample
            balanced accuracy ({num(overview.evaluation[overview.recommended_model]?.balanced_accuracy.mean, 3)}, 95% CI [
            {num(overview.evaluation[overview.recommended_model]?.balanced_accuracy.ci_lo, 3)},{' '}
            {num(overview.evaluation[overview.recommended_model]?.balanced_accuracy.ci_hi, 3)}]). Research, not investment advice.
          </p>
        </>
      )}
      {status && !status.snapshot && !running && (
        <p className={styles.muted}>No predictions yet. Click “Sync data” (the first run takes a few minutes).</p>
      )}
    </section>
  );
}

function PredictionRow({ row, open, onToggle }: { row: OverviewRow; open: boolean; onToggle: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || detail) return;
    api<Detail>(`/research/live/predictions/${encodeURIComponent(row.symbol)}`)
      .then(setDetail)
      .catch((e: Error) => setError(e.message));
  }, [open, detail, row.symbol]);

  const question = `Predict ${short(row.symbol)} for the next trading day. Explain the prediction and how reliable the model and the explanation are.`;
  return (
    <>
      <tr>
        <td>{short(row.symbol)}</td>
        <td>{row.as_of}</td>
        <td>{num(row.last_close)}</td>
        <td>{row.regime.label.replace('_', ' / ')}</td>
        <td>
          <span className={row.consensus.direction === 'up' ? styles.pillUp : styles.pillDown}>
            {row.consensus.direction === 'up' ? '▲' : '▼'} {pct(row.consensus.prob_up)}
          </span>
        </td>
        <td>
          {row.consensus.models_up}/{row.consensus.n_models}
        </td>
        <td>
          {pct(row.recommended?.prob_up)} <small className={styles.muted}>±{pct(row.recommended?.seed_sd)}</small>
        </td>
        <td>
          <button type="button" className={styles.linkBtn} onClick={onToggle}>
            {open ? 'Hide' : 'Why?'}
          </button>{' '}
          <Link className={styles.linkBtn} to={`/chat?q=${encodeURIComponent(question)}`}>
            Ask
          </Link>
        </td>
      </tr>
      {open && (
        <tr className={styles.detailRow}>
          <td colSpan={8}>
            {error && <div className={styles.error}>{error}</div>}
            {!detail && !error && <p className={styles.muted}>Loading explanation…</p>}
            {detail && <ExplanationView detail={detail} />}
          </td>
        </tr>
      )}
    </>
  );
}

function ExplanationView({ detail }: { detail: Detail }) {
  const p = detail.prediction;
  const [model, setModel] = useState(p.recommended_model);
  const e = p.explanations.find((x) => x.model === model) ?? p.explanations[0];
  const rel = p.reliability.by_model[e.model];
  const top = e.features.slice(0, 8);
  const maxAbs = Math.max(...top.map((f) => Math.abs(f.phi ?? 0)), 1e-6);

  return (
    <div className={styles.explain}>
      <div className={styles.panelHeader}>
        <strong>
          Why {e.label} says {pct(e.prob_up)} up (baseline {pct(e.baseline_prob)})
        </strong>
        <div className={styles.segmented}>
          {p.explanations.map((x) => (
            <button key={x.model} type="button" aria-pressed={x.model === model} onClick={() => setModel(x.model)}>
              {MODEL_LABELS[x.model] ?? x.model}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.explainGrid}>
        <div>
          <p className={styles.muted}>Top feature contributions to P(up), in percentage points (Shapley values)</p>
          {top.map((f) => {
            const w = `${(50 * Math.abs(f.phi ?? 0)) / maxAbs}%`;
            const up = (f.phi ?? 0) >= 0;
            return (
              <div key={f.feature} className={styles.attrRow} title={`${f.feature} = ${num(f.value, 4)}`}>
                <span className={styles.attrLabel}>{f.description}</span>
                <div className={styles.attrTrack}>
                  <span className={styles.attrAxis} />
                  <span className={up ? styles.attrBarUp : styles.attrBarDown} style={up ? { left: '50%', width: w } : { right: '50%', width: w }} />
                </div>
                <span className={styles.attrValue}>
                  {up ? '+' : ''}
                  {num(100 * (f.phi ?? 0), 1)} pp
                </span>
              </div>
            );
          })}
          <p className={styles.muted}>
            Time view:{' '}
            {e.time_blocks.map((b) => `${b.block} ${(b.phi ?? 0) >= 0 ? '+' : ''}${num(100 * (b.phi ?? 0), 1)} pp`).join(' · ')}
          </p>
        </div>
        <div>
          <p className={styles.muted}>Explanation reliability</p>
          <div className={styles.relGrid}>
            <Gauge label="Seed stability" value={rel?.seed_stability} hint="same answer across training seeds" />
            <Gauge label="Temporal stability" value={rel?.temporal_stability} hint="similar explanation on consecutive days" />
            <Gauge label="Robustness" value={rel?.robustness} hint="unchanged under small input noise" />
            <Gauge label="Model agreement" value={p.reliability.model_agreement} hint="models rely on the same features" />
            <div className={styles.gauge}>
              <span className={styles.muted}>Faithfulness</span>
              <strong>{rel?.faithfulness_ratio ? `${num(rel.faithfulness_ratio, 1)}×` : '–'}</strong>
              <small className={styles.muted}>top-3 features vs random (&gt;1.5 good)</small>
            </div>
          </div>
          <ul className={styles.caveats}>
            {p.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Gauge({ label, value, hint }: { label: string; value: number | null | undefined; hint: string }) {
  const level = value === null || value === undefined ? '' : value >= 0.7 ? styles.relHigh : value >= 0.4 ? styles.relMid : styles.relLow;
  return (
    <div className={styles.gauge}>
      <span className={styles.muted}>{label}</span>
      <strong className={level}>{num(value)}</strong>
      <small className={styles.muted}>{hint}</small>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.muted}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
