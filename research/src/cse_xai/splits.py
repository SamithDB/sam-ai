"""Expanding-window walk-forward splits on the trading calendar, with an embargo.

    |---------- train (expanding) ----------| e |-- val --| e |-- test --|
                                              ^ embargo days dropped at each boundary

Splits are defined on dates, so every symbol shares the same folds (needed for pooled
models and cross-stock comparisons). Training labels whose `label_date` falls on or
after the first validation date are purged, and the same applies between val and test.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from .config import SplitConfig


@dataclass(frozen=True)
class Fold:
    index: int
    train_dates: pd.DatetimeIndex
    val_dates: pd.DatetimeIndex
    test_dates: pd.DatetimeIndex

    def describe(self) -> str:
        return (
            f"fold {self.index}: train {self.train_dates[0].date()}..{self.train_dates[-1].date()} "
            f"({len(self.train_dates)}d) | val {self.val_dates[0].date()}..{self.val_dates[-1].date()} "
            f"| test {self.test_dates[0].date()}..{self.test_dates[-1].date()}"
        )


def walk_forward(dates: pd.Series | pd.DatetimeIndex, cfg: SplitConfig) -> list[Fold]:
    calendar = pd.DatetimeIndex(sorted(pd.unique(pd.DatetimeIndex(dates))))
    e = cfg.embargo_days
    folds: list[Fold] = []
    train_end = cfg.min_train_days  # exclusive index into calendar
    while True:
        val_start = train_end + e
        val_end = val_start + cfg.val_days
        test_start = val_end + e
        test_end = test_start + cfg.test_days
        if test_end > len(calendar):
            break
        folds.append(
            Fold(
                index=len(folds),
                train_dates=calendar[:train_end],
                val_dates=calendar[val_start:val_end],
                test_dates=calendar[test_start:test_end],
            )
        )
        train_end += cfg.step_days
    return folds


def select(panel: pd.DataFrame, dates: pd.DatetimeIndex, before: pd.Timestamp | None = None) -> pd.DataFrame:
    """Rows on `dates` that have a label; optionally purge rows whose label resolves on/after `before`."""
    rows = panel[panel["date"].isin(dates) & panel["label"].notna()]
    if before is not None:
        rows = rows[rows["label_date"] < before]
    return rows


def fold_frames(panel: pd.DataFrame, fold: Fold) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    train = select(panel, fold.train_dates, before=fold.val_dates[0])
    val = select(panel, fold.val_dates, before=fold.test_dates[0])
    test = select(panel, fold.test_dates)
    return train, val, test
