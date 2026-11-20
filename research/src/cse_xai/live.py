"""Live prediction pipeline on the data stored in MongoDB.

refresh() does, in order:
  1. Build the modelling table from the stored bars (same features/labels/regimes as the thesis pipeline).
  2. Walk-forward evaluation of every model -> out-of-sample evidence (also written to
     results/<config>_db/summary.json, so the /research page shows it).
  3. Train final models on all labelled history (last `val_days` as validation), one per seed.
  4. Predict the next-day direction for every symbol from its latest bar.
  5. Explain each prediction (feature Shapley, time-block Shapley) and measure explanation
     reliability (seed stability, temporal stability, robustness, deletion faithfulness).
  6. Return one snapshot document; the service stores it in MongoDB.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import json
import time

import numpy as np
import pandas as pd

from .config import RESEARCH_ROOT, ExperimentConfig
from .dataset import build_table
from .explain import (
    deletion_faithfulness,
    feature_shapley,
    mean_pairwise_corr,
    permutations,
    rank_corr,
    time_block_shapley,
)
from .export import MODEL_LABELS, write_summary
from .features import FEATURE_COLUMNS, FEATURE_GROUPS
from .metrics import block_bootstrap_ci, point_metrics
from .models import make_model
from .runner import run_walk_forward
from .splits import select
from .store import ResearchStore
from .windows import build_windows, fit_scaler

SNAPSHOT_SCHEMA_VERSION = 1
LEARNING_MODELS = ["logreg", "random_forest", "lstm", "patchtst"]
EXPLAIN_DAYS = 5  # explain the last N days per symbol (temporal stability needs more than one)
N_PERM = 32
NOISE_SD = 0.1  # robustness check: Gaussian noise in standardised units
CONF_BUCKETS = [(0.0, 0.05), (0.05, 0.10), (0.10, 0.20), (0.20, 0.51)]

FEATURE_GROUP_OF = {f: g for g, cols in FEATURE_GROUPS.items() for f in cols}
FEATURE_DESCRIPTIONS = {
    "close_sma5_ratio": "close vs its 5-day average (relative gap)",
    "close_sma20_ratio": "close vs its 20-day average (relative gap)",
    "hl_range": "today's high-low range relative to close",
    "ret_1d": "today's log return",
    "ret_2d": "2-day log return",
    "ret_5d": "5-day log return",
    "ret_10d": "10-day log return",
    "ret_1d_lag1": "yesterday's log return",
    "ret_1d_lag2": "log return two days ago",
    "rsi_14": "14-day RSI (0-1 scale)",
    "macd_hist": "MACD histogram relative to price",
    "momentum_10": "10-day price momentum",
    "log_volume_z20": "volume vs its 20-day norm (z-score)",
    "turnover_proxy_z20": "turnover vs its 20-day norm (z-score)",
    "vol_5": "5-day return volatility",
    "vol_20": "20-day return volatility",
    "aspi_ret_1d": "ASPI index return today",
    "aspi_ret_5d": "ASPI index 5-day return",
    "spsl20_ret_1d": "S&P SL20 index return today",
    "spsl20_ret_5d": "S&P SL20 index 5-day return",
}


def _f(x) -> float | None:
    if x is None:
        return None
    x = float(x)
    return None if not np.isfinite(x) else round(x, 6)


# --------------------------------------------------------------------------- steps

def build_db_table(store: ResearchStore, cfg: ExperimentConfig) -> pd.DataFrame:
    panel, indexes = store.load_panel(cfg.symbols), store.load_indexes()
    return build_table(panel, indexes, cfg)


def evaluate(table: pd.DataFrame, cfg: ExperimentConfig, log) -> tuple[pd.DataFrame, str]:
    name = f"{cfg.name}_db"
    preds = run_walk_forward(table, cfg, cfg.models, log=log)
    out_dir = RESEARCH_ROOT / "results" / name
    out_dir.mkdir(parents=True, exist_ok=True)
    preds.to_parquet(out_dir / "predictions.parquet", index=False)
    config = json.loads(json.dumps(dataclasses.asdict(dataclasses.replace(cfg, name=name)), default=str))
    config["data_source"] = "mongodb:research_bars"
    (out_dir / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    write_summary(out_dir, preds, config, kind="real")
    return preds, name


def train_final(table: pd.DataFrame, cfg: ExperimentConfig, log):
    """Fit every learning model on all labelled history; the last val_days dates are the validation set."""
    calendar = pd.DatetimeIndex(sorted(table.loc[table["label"].notna(), "date"].unique()))
    e, v = cfg.splits.embargo_days, cfg.splits.val_days
    val_dates = calendar[-v:]
    train_dates = calendar[: len(calendar) - v - e]
    train_rows = select(table, train_dates, before=val_dates[0])
    val_rows = select(table, val_dates)
    scaler = fit_scaler(table, train_dates)
    tr = build_windows(table, train_rows, scaler, cfg.lookback)
    va = build_windows(table, val_rows, scaler, cfg.lookback)
    log(f"final fit: train {train_dates[0].date()}..{train_dates[-1].date()} | "
        f"val {val_dates[0].date()}..{val_dates[-1].date()} | windows {len(tr)}/{len(va)}")
    fitted: dict[str, list] = {}
    for name in LEARNING_MODELS:
        if name not in cfg.models:
            continue
        params = cfg.models.get(name) or {}
        seeds = cfg.seeds if make_model(name, params).stochastic else [cfg.seeds[0]]
        fitted[name] = []
        for seed in seeds:
            t0 = time.perf_counter()
            fitted[name].append(make_model(name, params).fit(tr, va, seed))
            log(f"  final {name:<14} seed={seed} fit {time.perf_counter() - t0:5.1f}s")
    return fitted, scaler, {"train_start": str(train_dates[0].date()), "train_end": str(train_dates[-1].date()),
                            "val_start": str(val_dates[0].date()), "val_end": str(val_dates[-1].date()),
                            "n_train": len(tr), "n_val": len(va)}


# --------------------------------------------------------------------------- evidence from walk-forward

def _seed_avg(preds: pd.DataFrame) -> pd.DataFrame:
    return preds.groupby(["model", "symbol", "date"], as_index=False).agg(
        label=("label", "first"), prob=("prob", "mean"), regime=("regime", "first"))


def _ba(g: pd.DataFrame) -> float | None:
    if len(g) < 5 or g["label"].nunique() < 2:
        return None
    return point_metrics(g["label"].to_numpy(), g["prob"].to_numpy())["balanced_accuracy"]


def oos_evidence(preds: pd.DataFrame) -> dict:
    ens = _seed_avg(preds)
    out = {}
    for model, g in ens.groupby("model"):
        # Same definitions as summary.json: mean of per-seed scores, CI on the seed-averaged probability.
        per_seed = [point_metrics(s["label"].to_numpy(), s["prob"].to_numpy())["balanced_accuracy"]
                    for _, s in preds[preds["model"] == model].groupby("seed")]
        lo, hi = block_bootstrap_ci(g, n_boot=1000)["balanced_accuracy"]
        ba = (float(np.mean(per_seed)), lo, hi)
        conf = (g["prob"] - 0.5).abs()
        hit = ((g["prob"] > 0.5).astype(int) == g["label"]).astype(float)
        buckets = []
        for lo, hi in CONF_BUCKETS:
            m = (conf >= lo) & (conf < hi)
            buckets.append({"lo": lo, "hi": min(hi, 0.5), "n": int(m.sum()),
                            "accuracy": _f(hit[m].mean()) if m.any() else None})
        out[model] = {
            "n_test": len(g),
            "balanced_accuracy": {"mean": _f(ba[0]), "ci_lo": _f(ba[1]), "ci_hi": _f(ba[2])},
            "beats_chance": bool(ba[1] > 0.5),
            "by_regime": {k: {"n": len(x), "balanced_accuracy": _f(_ba(x))} for k, x in g.groupby("regime")},
            "by_symbol": {k: {"n": len(x), "balanced_accuracy": _f(_ba(x))} for k, x in g.groupby("symbol")},
            # Accuracy = how often the predicted direction was right, split by how far P(up) was from 0.5.
            "confidence_buckets": buckets,
        }
    return out


def _bucket_for(buckets: list[dict], prob: float) -> dict | None:
    c = abs(prob - 0.5)
    return next((b for b in buckets if b["lo"] <= c < b["hi"] or (b["hi"] == 0.5 and c >= b["lo"])), None)


# --------------------------------------------------------------------------- snapshot

def refresh(store: ResearchStore, cfg: ExperimentConfig, data_version: str, log=print) -> dict:
    t_start = time.perf_counter()
    table = build_db_table(store, cfg)
    log(f"table: {len(table)} rows, {table['date'].nunique()} dates, "
        f"{table['date'].min().date()}..{table['date'].max().date()}")

    log("step 1/3: walk-forward evaluation")
    preds, experiment = evaluate(table, cfg, log)
    evidence = oos_evidence(preds)

    log("step 2/3: final models")
    fitted, scaler, fit_info = train_final(table, cfg, log)

    log("step 3/3: predictions + explanations")
    # Last EXPLAIN_DAYS rows per symbol; the very last one is the live prediction.
    recent = table.sort_values(["symbol", "date"]).groupby("symbol").tail(EXPLAIN_DAYS)
    ws = build_windows(table, recent, scaler, cfg.lookback, labelled=False)
    meta = ws.meta.reset_index(drop=True)
    X = ws.X_seq
    rng = np.random.default_rng(0)
    perms = permutations(len(FEATURE_COLUMNS), N_PERM, seed=0)
    # Predict a symbol only from its own latest bar. If that window has a missing value it was skipped,
    # and the symbol is reported as unavailable instead of silently predicting from an older day.
    last_dates = table.groupby("symbol")["date"].max()
    latest_idx = {sym: i for sym, i in meta.groupby("symbol")["date"].idxmax().items()
                  if meta.loc[i, "date"] == last_dates[sym]}  # symbol -> row in X
    unavailable = [{"symbol": sym, "as_of": str(last_dates[sym].date()),
                    "reason": "a value in the 20-day input window is missing at the source; no prediction is made"}
                   for sym in sorted(set(last_dates.index) - set(latest_idx))]
    if not latest_idx:
        raise ValueError("No symbol has a complete input window for its latest day.")
    latest_rows = np.array(sorted(latest_idx.values()))
    X_noisy = X[latest_rows] + rng.normal(0, NOISE_SD, X[latest_rows].shape).astype(np.float32)

    per_model: dict[str, dict] = {}
    for name, models in fitted.items():
        t0 = time.perf_counter()
        probs, bases, phis, tphis, faith, robust = [], [], [], [], [], []
        for m in models:
            phi, fx, fbase = feature_shapley(m, X, perms)
            block_names, tphi = time_block_shapley(m, X[latest_rows])
            phi_noisy, _, _ = feature_shapley(m, X_noisy, perms)
            probs.append(fx)
            bases.append(fbase)
            phis.append(phi)
            tphis.append(tphi)
            faith.append(deletion_faithfulness(m, X[latest_rows], phi[latest_rows]))
            robust.append([rank_corr(phi[r], phi_noisy[i]) for i, r in enumerate(latest_rows)])
        per_model[name] = {
            "prob": np.stack(probs),  # [seeds, N]
            "phi": np.stack(phis),  # [seeds, N, F]
            "phi_avg": np.stack(phis).mean(axis=0),  # [N, F], seed-averaged
            "tphi": np.stack(tphis),  # [seeds, n_symbols, B]
            "faith": faith, "robust": robust, "block_names": block_names,
            # P(up) with every feature at its training mean; averaged over seeds like prob and phi,
            # so sum(phi) == prob_up - baseline_prob holds for the seed-averaged explanation too.
            "base_prob": np.stack(bases).mean(axis=0),
        }
        log(f"  explained {name:<14} ({len(models)} seed(s)) {time.perf_counter() - t0:5.1f}s")

    learning = [m for m in LEARNING_MODELS if m in per_model]
    best = max(learning, key=lambda m: (evidence.get(m, {}).get("balanced_accuracy", {}).get("mean") or 0))
    as_of = table["date"].max()

    predictions = []
    for k, row_i in enumerate(latest_rows):
        r = meta.iloc[row_i]
        symbol = r["symbol"]
        src = table[(table["symbol"] == symbol) & (table["date"] == r["date"])].iloc[0]
        sym_rows = np.flatnonzero(meta["symbol"].to_numpy() == symbol)  # this symbol's recent days, oldest first
        model_rows, explanations, reliability = [], [], {}
        for name in learning:
            pm = per_model[name]
            p_seeds = pm["prob"][:, row_i]
            prob = float(p_seeds.mean())
            ev = evidence.get(name, {})
            regime_ev = ev.get("by_regime", {}).get(r["regime"], {})
            sym_ev = ev.get("by_symbol", {}).get(symbol, {})
            model_rows.append({
                "model": name, "label": MODEL_LABELS.get(name, name),
                "prob_up": _f(prob), "seed_sd": _f(p_seeds.std()), "n_seeds": len(p_seeds),
                "direction": "up" if prob > 0.5 else "down",
                "oos_balanced_accuracy": ev.get("balanced_accuracy"),
                "beats_chance": ev.get("beats_chance"),
                "regime_balanced_accuracy": regime_ev.get("balanced_accuracy"), "regime_n": regime_ev.get("n"),
                "symbol_balanced_accuracy": sym_ev.get("balanced_accuracy"), "symbol_n": sym_ev.get("n"),
                "confidence_bucket": _bucket_for(ev.get("confidence_buckets", []), prob),
            })
            phi_avg = pm["phi_avg"]
            phi_now = phi_avg[row_i]
            order = np.argsort(-np.abs(phi_now))
            tphi_now = pm["tphi"][:, k].mean(axis=0)
            explanations.append({
                "model": name, "label": MODEL_LABELS.get(name, name),
                "prob_up": _f(prob), "baseline_prob": _f(pm["base_prob"][row_i]),
                "features": [{"feature": FEATURE_COLUMNS[j], "group": FEATURE_GROUP_OF[FEATURE_COLUMNS[j]],
                              "description": FEATURE_DESCRIPTIONS[FEATURE_COLUMNS[j]],
                              "value": _f(src[FEATURE_COLUMNS[j]]), "phi": _f(phi_now[j])} for j in order],
                "groups": sorted(({"group": g, "phi": _f(sum(phi_now[FEATURE_COLUMNS.index(c)] for c in cols))}
                                  for g, cols in FEATURE_GROUPS.items()), key=lambda d: -abs(d["phi"] or 0)),
                "time_blocks": [{"block": b, "phi": _f(v)} for b, v in zip(pm["block_names"], tphi_now)],
            })
            seed_stab = (mean_pairwise_corr([pm["phi"][s, row_i] for s in range(pm["phi"].shape[0])])
                         if pm["phi"].shape[0] > 1 else None)
            temporal = [rank_corr(phi_avg[a], phi_avg[b]) for a, b in zip(sym_rows, sym_rows[1:])]
            temporal = [t for t in temporal if t is not None]
            robust_vals = [rs[k] for rs in pm["robust"] if rs[k] is not None]
            faith_ratios = [f["ratio"] for f in pm["faith"] if f["ratio"] is not None]
            reliability[name] = {
                "seed_stability": _f(seed_stab),
                "temporal_stability": _f(np.mean(temporal)) if temporal else None,
                "robustness": _f(np.mean(robust_vals)) if robust_vals else None,
                "faithfulness_ratio": _f(np.mean(faith_ratios)) if faith_ratios else None,
            }
        model_agreement = mean_pairwise_corr([per_model[n]["phi_avg"][row_i] for n in learning])
        probs_now = [m["prob_up"] for m in model_rows]
        consensus = float(np.mean(probs_now))
        n_up = sum(p > 0.5 for p in probs_now)
        best_ev = evidence.get(best, {})
        caveats = []
        if not any(evidence.get(m, {}).get("beats_chance") for m in learning):
            caveats.append("No model beats chance out-of-sample on this data (every 95% CI includes 0.5): "
                           "treat this prediction as illustrative, not as a usable signal.")
        if table["date"].nunique() < 500:
            caveats.append(f"Only {table['date'].nunique()} trading days are stored; the thesis design needs "
                           "several years to cover multiple market regimes.")
        if (best_ev.get("by_regime", {}).get(r["regime"], {}).get("n") or 0) < 50:
            caveats.append(f"Few out-of-sample test days in the current regime ({r['regime']}), so regime-specific "
                           "accuracy is very uncertain.")
        if r["date"] < as_of:
            caveats.append(f"This stock's latest stored bar is {r['date'].date()}, older than the other stocks "
                           f"({as_of.date()}); the prediction is based on stale data.")
        caveats.append("Explanations describe what the model relied on, not why the market will move.")
        predictions.append({
            "symbol": symbol,
            "as_of": str(r["date"].date()),
            "last_close": _f(src["close"]),
            "target": "direction of the next trading day's close vs the as_of close",
            "regime": {"label": r["regime"], "trend": src["trend_regime"], "volatility": src["vol_regime"]},
            "consensus": {"prob_up": _f(consensus), "direction": "up" if consensus > 0.5 else "down",
                          "models_up": int(n_up), "n_models": len(probs_now),
                          "method": "mean P(up) of the learning models"},
            "recommended_model": best,
            "models": model_rows,
            "explanations": explanations,
            "reliability": {"by_model": reliability, "model_agreement": _f(model_agreement)},
            "caveats": caveats,
        })

    snapshot = {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "created_at": dt.datetime.now(dt.UTC).isoformat(),
        "data_version": data_version,
        "config": cfg.name,
        "evaluation_experiment": experiment,
        "as_of": str(as_of.date()),
        "data": {"symbols": cfg.symbols, "first_date": str(table["date"].min().date()),
                 "last_date": str(as_of.date()), "n_days": int(table["date"].nunique())},
        "final_fit": fit_info,
        "recommended_model": best,
        "evaluation": {m: {k: v for k, v in e.items() if k not in ("by_symbol",)} for m, e in evidence.items()},
        "methods": {
            "explanation": f"Shapley values over the {len(FEATURE_COLUMNS)} features (sampled, {N_PERM} antithetic "
                           "permutations; masked feature = training mean) and exact Shapley over time blocks; "
                           "phi is the change in P(up) attributed to each feature, and the phis sum to "
                           "P(up) - baseline P(up).",
            "seed_stability": "mean pairwise Spearman correlation of feature attributions across training seeds",
            "temporal_stability": f"mean Spearman correlation of attributions on consecutive days (last "
                                  f"{EXPLAIN_DAYS} days)",
            "robustness": f"Spearman correlation of attributions before/after Gaussian input noise "
                          f"(sd {NOISE_SD} in standardised units)",
            "faithfulness_ratio": "change in P(up) when masking the top-3 attributed features divided by the change "
                                  "when masking 3 random features (> 1 = explanation points at what matters)",
            "model_agreement": "mean pairwise Spearman correlation of attributions across models",
            "uncertainty": "seed_sd = spread of P(up) across training seeds; confidence_bucket = historical "
                           "out-of-sample accuracy when the model was similarly confident",
        },
        "predictions": predictions,
        "unavailable": unavailable,
        "elapsed_s": round(time.perf_counter() - t_start, 1),
    }
    log(f"refresh done in {snapshot['elapsed_s']}s")
    return snapshot
