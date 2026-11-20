"""Run the walk-forward benchmark and write predictions + a metrics summary.

Usage (from research/, venv active):
    python scripts/run_experiment.py configs/dev_1y.yaml
Real cse.lk data only (the latest raw download for the config). Outputs: results/<name>/predictions.parquet,
metrics.csv, config.json, summary.json
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import time

import pandas as pd

from cse_xai.config import RESEARCH_ROOT, load_config
from cse_xai.data import latest_run_dir, load_public_indexes, load_public_stocks
from cse_xai.dataset import build_table
from cse_xai.export import write_summary
from cse_xai.metrics import summarise
from cse_xai.runner import run_walk_forward


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("config")
    ap.add_argument("--models", nargs="*", help="subset of models from the config")
    args = ap.parse_args()

    cfg = load_config(args.config)
    run_dir = latest_run_dir(cfg.raw_path)
    panel, indexes = load_public_stocks(run_dir, cfg.symbols), load_public_indexes(run_dir)
    print(f"Data: {run_dir}")
    models = {k: v for k, v in cfg.models.items() if not args.models or k in args.models}

    table = build_table(panel, indexes, cfg)
    t0 = time.perf_counter()
    preds = run_walk_forward(table, cfg, models)
    print(f"\nTotal time {time.perf_counter() - t0:.0f}s")

    out_dir = RESEARCH_ROOT / "results" / cfg.name
    out_dir.mkdir(parents=True, exist_ok=True)
    preds.to_parquet(out_dir / "predictions.parquet", index=False)
    summary = summarise(preds)
    summary.to_csv(out_dir / "metrics.csv", index=False)
    config = json.loads(json.dumps(dataclasses.asdict(cfg), default=str))
    (out_dir / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    write_summary(out_dir, preds, config, kind="real")

    pd.set_option("display.width", 200)
    cols = ["model", "n_test", "seeds"]
    for k in ("balanced_accuracy", "mcc", "macro_f1"):
        summary[k] = summary.apply(
            lambda r, k=k: f"{r[k]:.3f} +/-{r[k + '_seed_sd']:.3f} [{r[k + '_ci_lo']:.3f}, {r[k + '_ci_hi']:.3f}]", axis=1)
        cols.append(k)
    print("\nOut-of-sample test metrics  (mean +/- seed sd [95% block-bootstrap CI])")
    print(summary[cols].to_string(index=False))
    print(f"\nWrote {out_dir}")


if __name__ == "__main__":
    main()
