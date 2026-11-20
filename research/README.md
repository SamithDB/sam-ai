# research/: MSc thesis pipeline

Temporal reliability of explainable deep learning for CSE stock-direction prediction
under market-regime shifts. Python package `cse_xai`; the TypeScript app in `apps/`
presents the results this pipeline writes to `research/results/`.

## Setup (Windows, local)

```powershell
cd research
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"
.venv\Scripts\python -m pytest
```

Add more as the phases arrive: `pip install -e ".[dl,xai,analysis]"`.

## Pipeline status

| Step | Module | Status |
|---|---|---|
| Raw data (1-year public cse.lk) | `scripts/cse_public_spike.py` | done; dev data only |
| Multi-year history | — | **blocked on data access** (see `docs/cse-data-spike.md`) |
| Loaders + audit | `cse_xai/data.py` | done |
| Features (6 groups, trailing-only) | `cse_xai/features.py` | done |
| Labels (explicit zero-return policy) | `cse_xai/labels.py` | done |
| Regimes (trend × volatility, trailing-only) | `cse_xai/regimes.py` | done |
| Walk-forward + embargo + purging | `cse_xai/splits.py` | done |
| Look-back windows + train-only scaling | `cse_xai/windows.py` | done |
| Models (prev-direction, majority, LR, RF, LSTM, PatchTST) | `cse_xai/models/` | done; fixed hyperparameters plus a small validation grid |
| Walk-forward runner + metrics (block-bootstrap CIs) | `cse_xai/runner.py`, `metrics.py`, `scripts/run_experiment.py` | done |
| Equal-budget hyperparameter tuning (Optuna) | — | later, on the full dataset |
| MongoDB store + incremental cse.lk sync (point-in-time, no overwrites) | `cse_xai/store.py`, `cse_public.py` | done |
| Live predictions + explanations on stored data | `cse_xai/live.py`, `service.py` | done (first version) |
| XAI: feature Shapley + time-block Shapley + deletion faithfulness | `cse_xai/explain.py` | done (first version) |
| XAI: IG, WindowSHAP proper, TIMING, counterfactuals | — | next |
| Reliability: seed/temporal stability, robustness, faithfulness, model agreement | `cse_xai/live.py` | live snapshot only; thesis-scale analysis next |
| Reliability: sanity (model randomisation) | — | |
| Statistical analysis + figures | — | |

## Rules

- `data/` and `results/` are git-ignored; raw dumps are immutable, and every dataset has a provenance note.
- Every feature or regime value at day *t* uses only data ≤ *t*. `tests/test_leakage.py` enforces this.
- **Real data only.** No synthetic, sample or fixture data anywhere; tests run on the real cse.lk download
  (`tests/conftest.py`). A missing source value is never filled in: samples whose window contains one are skipped.

## Build the dev table / run the benchmark

```powershell
.venv\Scripts\python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\python scripts\build_dataset.py configs\dev_1y.yaml
.venv\Scripts\python scripts\run_experiment.py configs\dev_1y.yaml                          # real 1-year data
```

## Research service (used by the TS app)

The Nest API talks to this service; the browser never does. From the repo root, `npm start` runs it together
with the API and UI, and `npm run start:research` runs it alone (both via `tools/start-research.mjs`).
To run it by hand:

```powershell
.venv\Scripts\python -m pip install -e ".[service]"
.venv\Scripts\python -m uvicorn cse_xai.service:app --port 8001
```

- `POST /sync` fetches the public one-year history from cse.lk, inserts only the trading days MongoDB is missing
  (`research_bars`, `research_index_values`), then rebuilds predictions if the data changed. Settled bars are never
  overwritten; differing source values go to `research_bar_revisions`. Syncing regularly grows the history past one year.
- A rebuild re-runs the walk-forward evaluation (written to `results/<config>_db/`), retrains the final models,
  predicts the next day for each stock, and explains it with reliability scores. It takes about 5 minutes on CPU.
- `GET /predictions/{symbol}` returns per-model P(up), out-of-sample evidence, regime, Shapley explanation,
  explanation reliability and caveats. The chat's Research Agent reads this.

Settings: `MONGO_URI`, `RESEARCH_CONFIG` (default `configs/dev_1y.yaml`), `CSE_REQUEST_DELAY` (default 1 s),
from the environment or the repo-root `.env`.
