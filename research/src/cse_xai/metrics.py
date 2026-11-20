"""Predictive metrics with moving-block bootstrap confidence intervals over trading dates.

Bootstrap resamples *blocks of consecutive dates* (all stocks on a date move together),
which respects both serial and cross-sectional dependence better than resampling rows.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import balanced_accuracy_score, f1_score, matthews_corrcoef

METRICS = {
    "balanced_accuracy": lambda y, p: balanced_accuracy_score(y, p),
    "mcc": lambda y, p: matthews_corrcoef(y, p),
    "macro_f1": lambda y, p: f1_score(y, p, average="macro", zero_division=0),
}


def point_metrics(y: np.ndarray, prob: np.ndarray, threshold: float = 0.5) -> dict[str, float]:
    pred = (prob >= threshold).astype(int)
    return {name: float(fn(y, pred)) for name, fn in METRICS.items()}


def block_bootstrap_ci(
    df: pd.DataFrame, n_boot: int = 1000, block: int = 5, alpha: float = 0.05, seed: int = 0
) -> dict[str, tuple[float, float]]:
    """df needs columns date, label, prob."""
    rng = np.random.default_rng(seed)
    dates = np.array(sorted(df["date"].unique()))
    groups = {d: g for d, g in df.groupby("date")}
    n_blocks = int(np.ceil(len(dates) / block))
    samples = {k: [] for k in METRICS}
    for _ in range(n_boot):
        starts = rng.integers(0, max(len(dates) - block + 1, 1), n_blocks)
        picked = np.concatenate([dates[s : s + block] for s in starts])[: len(dates)]
        boot = pd.concat([groups[d] for d in picked])
        if boot["label"].nunique() < 2:
            continue
        for k, v in point_metrics(boot["label"].to_numpy(), boot["prob"].to_numpy()).items():
            samples[k].append(v)
    return {k: (float(np.quantile(v, alpha / 2)), float(np.quantile(v, 1 - alpha / 2))) for k, v in samples.items()}


def summarise(preds: pd.DataFrame, n_boot: int = 1000) -> pd.DataFrame:
    """One row per model: metrics on all out-of-sample test predictions.

    Stochastic models: the point estimate is the mean over seeds (plus the seed std), and
    the CI is bootstrapped on the seed-averaged probability.
    """
    rows = []
    for model, g in preds.groupby("model", sort=False):
        per_seed = pd.DataFrame(
            [point_metrics(s["label"].to_numpy(), s["prob"].to_numpy()) for _, s in g.groupby("seed")]
        )
        ens = g.groupby(["symbol", "date"], as_index=False).agg(label=("label", "first"), prob=("prob", "mean"))
        ci = block_bootstrap_ci(ens, n_boot=n_boot)
        row = {"model": model, "n_test": len(ens), "seeds": g["seed"].nunique()}
        for k in METRICS:
            row[k] = per_seed[k].mean()
            row[f"{k}_seed_sd"] = per_seed[k].std(ddof=0)
            row[f"{k}_ci_lo"], row[f"{k}_ci_hi"] = ci[k]
        rows.append(row)
    return pd.DataFrame(rows)
