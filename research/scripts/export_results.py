"""(Re)generate summary.json for existing experiments without re-running models.

Usage (from research/):
    python scripts/export_results.py                # every results/<name>/ with predictions.parquet
    python scripts/export_results.py dev_1y         # just one
"""

from __future__ import annotations

import json
import sys

import pandas as pd

from cse_xai.config import RESEARCH_ROOT
from cse_xai.export import write_summary


def main(names: list[str]) -> None:
    root = RESEARCH_ROOT / "results"
    dirs = [root / n for n in names] if names else sorted(p for p in root.iterdir() if p.is_dir())
    for d in dirs:
        preds_path, cfg_path = d / "predictions.parquet", d / "config.json"
        if not preds_path.exists() or not cfg_path.exists():
            print(f"skip {d.name}: missing predictions.parquet or config.json")
            continue
        config = json.loads(cfg_path.read_text(encoding="utf-8"))
        print(f"wrote {write_summary(d, pd.read_parquet(preds_path), config, kind='real')}")


if __name__ == "__main__":
    main(sys.argv[1:])
