"""Export experiment results as `summary.json`, the contract the TypeScript app reads.

The app never reads Parquet. Everything it shows comes from this file, so the numbers in
the UI and in LLM answers are exactly those computed here. Bump SCHEMA_VERSION when
the shape changes (apps/api/src/research/research.types.ts mirrors it).
"""

from __future__ import annotations

import datetime as dt
import json
import math
from pathlib import Path

import pandas as pd

from .metrics import METRICS, point_metrics, summarise

SCHEMA_VERSION = 1
MODEL_ORDER = ["prev_direction", "majority", "logreg", "random_forest", "lstm", "patchtst"]
MODEL_LABELS = {
    "prev_direction": "Previous Direction",
    "majority": "Majority class",
    "logreg": "Logistic Regression",
    "random_forest": "Random Forest",
    "lstm": "LSTM",
    "patchtst": "PatchTST",
}


def _clean(x):
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return None
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_clean(v) for v in x]
    return x


def _seed_averaged(preds: pd.DataFrame) -> pd.DataFrame:
    keys = ["model", "symbol", "date"]
    return preds.groupby(keys, as_index=False).agg(
        label=("label", "first"), prob=("prob", "mean"), fold=("fold", "first"),
        regime=("regime", "first"), trend_regime=("trend_regime", "first"), vol_regime=("vol_regime", "first"),
    )


def _breakdown(ens: pd.DataFrame, by: str) -> list[dict]:
    rows = []
    for (model, key), g in ens.dropna(subset=[by]).groupby(["model", by]):
        m = point_metrics(g["label"].to_numpy(), g["prob"].to_numpy()) if g["label"].nunique() > 1 else {}
        rows.append({"model": model, by: str(key) if by != "fold" else int(key), "n": len(g),
                     "up_rate": float(g["label"].mean()), **{k: m.get(k) for k in METRICS}})
    return rows


def _model_sort(models) -> list[str]:
    return sorted(models, key=lambda m: MODEL_ORDER.index(m) if m in MODEL_ORDER else len(MODEL_ORDER))


def build_summary(preds: pd.DataFrame, config: dict, kind: str, n_boot: int = 1000) -> dict:
    overall = summarise(preds, n_boot=n_boot)
    ens = _seed_averaged(preds)
    models = _model_sort(preds["model"].unique())

    fold_dates = (
        preds.groupby("fold")["date"].agg(["min", "max"]).reset_index()
        .rename(columns={"min": "test_start", "max": "test_end"})
    )
    return _clean({
        "schema_version": SCHEMA_VERSION,
        "name": config["name"],
        "kind": kind,
        "created_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "data": {
            "symbols": sorted(preds["symbol"].unique().tolist()),
            "test_start": str(preds["date"].min().date()),
            "test_end": str(preds["date"].max().date()),
            "n_test": int(ens.groupby(["symbol", "date"]).ngroups),
            "up_rate": float(ens.drop_duplicates(["symbol", "date"])["label"].mean()),
        },
        "config": {
            "lookback": config.get("lookback"),
            "seeds": config.get("seeds"),
            "labels": config.get("labels"),
            "regimes": config.get("regimes"),
            "splits": config.get("splits"),
        },
        "models": [{"id": m, "label": MODEL_LABELS.get(m, m)} for m in models],
        "folds": [
            {"fold": int(r.fold), "test_start": str(r.test_start.date()), "test_end": str(r.test_end.date())}
            for r in fold_dates.itertuples()
        ],
        "metrics": [
            {
                "model": r["model"], "n_test": int(r["n_test"]), "seeds": int(r["seeds"]),
                **{k: {"mean": r[k], "seed_sd": r[f"{k}_seed_sd"], "ci_lo": r[f"{k}_ci_lo"], "ci_hi": r[f"{k}_ci_hi"]}
                   for k in METRICS},
            }
            for _, r in overall.set_index("model").loc[models].reset_index().iterrows()
        ],
        "by_fold": _breakdown(ens, "fold"),
        "by_regime": _breakdown(ens, "regime"),
        "by_symbol": _breakdown(ens, "symbol"),
    })


def write_summary(out_dir: Path, preds: pd.DataFrame, config: dict, kind: str) -> Path:
    path = out_dir / "summary.json"
    path.write_text(json.dumps(build_summary(preds, config, kind), indent=2), encoding="utf-8")
    return path
