"""Build the modelling table for an experiment config and print the audit.

Usage (from repo root, with the research venv active):
    python research/scripts/build_dataset.py research/configs/dev_1y.yaml
Writes research/data/interim/<name>.parquet.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from cse_xai.config import RESEARCH_ROOT, load_config
from cse_xai.data import audit, latest_run_dir, load_public_indexes, load_public_stocks
from cse_xai.dataset import build_table
from cse_xai.features import FEATURE_COLUMNS
from cse_xai.splits import fold_frames, walk_forward


def main(config_path: str) -> None:
    cfg = load_config(config_path)
    run_dir = latest_run_dir(cfg.raw_path)
    panel = load_public_stocks(run_dir, cfg.symbols)
    indexes = load_public_indexes(run_dir)

    pd.set_option("display.width", 160)
    print(f"Source run: {run_dir}\n\n== Data audit ==")
    print(audit(panel).to_string())

    table = build_table(panel, indexes, cfg)
    print(f"\n== Modelling table == rows={len(table)}  labelled={int(table['label'].notna().sum())}")
    print(f"feature NaNs after warm-up: {int(table[FEATURE_COLUMNS].isna().sum().sum())}")
    print("class balance (label=1):", round(table["label"].mean(), 3))
    print("\nregime counts (labelled rows):")
    print(table.dropna(subset=["label"])["regime"].value_counts(dropna=False).to_string())

    folds = walk_forward(table["date"], cfg.splits)
    print(f"\n== Walk-forward == {len(folds)} folds")
    for fold in folds:
        tr, va, te = fold_frames(table, fold)
        print(f"{fold.describe()}  rows train/val/test = {len(tr)}/{len(va)}/{len(te)}")

    out = RESEARCH_ROOT / "data" / "interim" / f"{cfg.name}.parquet"
    out.parent.mkdir(parents=True, exist_ok=True)
    table.to_parquet(out, index=False)
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).parents[1] / "configs" / "dev_1y.yaml"))
