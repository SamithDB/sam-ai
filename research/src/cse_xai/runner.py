"""Walk-forward experiment runner: every model x fold x seed -> out-of-sample predictions."""

from __future__ import annotations

import time

import pandas as pd

from .config import ExperimentConfig
from .models import make_model
from .splits import fold_frames, walk_forward
from .windows import build_windows, fit_scaler


def run_walk_forward(table: pd.DataFrame, cfg: ExperimentConfig, models: dict[str, dict], log=print) -> pd.DataFrame:
    folds = walk_forward(table["date"], cfg.splits)
    if not folds:
        raise ValueError("No walk-forward folds: not enough dates for the split config")

    out = []
    for fold in folds:
        train_rows, val_rows, test_rows = fold_frames(table, fold)
        scaler = fit_scaler(table, fold.train_dates)
        tr, va, te = (build_windows(table, rows, scaler, cfg.lookback) for rows in (train_rows, val_rows, test_rows))
        log(f"{fold.describe()} | windows {len(tr)}/{len(va)}/{len(te)}")

        for name, params in models.items():
            model = make_model(name, params)
            seeds = cfg.seeds if model.stochastic else [cfg.seeds[0]]
            for seed in seeds:
                t0 = time.perf_counter()
                model = make_model(name, params).fit(tr, va, seed)
                prob = model.predict_proba(te)
                meta = te.meta.copy()
                meta["model"], meta["fold"], meta["seed"], meta["prob"] = name, fold.index, seed, prob
                out.append(meta)
                log(f"  {name:<14} seed={seed} fit {time.perf_counter() - t0:5.1f}s")
    return pd.concat(out, ignore_index=True)
