"""Assemble the modelling table: raw panel -> features -> labels -> regimes."""

from __future__ import annotations

import pandas as pd

from .config import ExperimentConfig
from .features import WARMUP_DAYS, build_features
from .labels import add_labels
from .regimes import add_regimes


def build_table(panel: pd.DataFrame, indexes: pd.DataFrame, cfg: ExperimentConfig) -> pd.DataFrame:
    table = build_features(panel, indexes)
    table = add_labels(table, cfg.labels)
    table = add_regimes(table, cfg.regimes, indexes)
    # Drop each symbol's indicator warm-up rows; they are never valid samples.
    rank = table.groupby("symbol").cumcount()
    return table[rank >= WARMUP_DAYS].reset_index(drop=True)
