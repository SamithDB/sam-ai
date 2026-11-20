"""Turn the modelling table into look-back windows for one fold.

Sample i (a labelled row at date t for one symbol) gets
    X_seq[i]  = scaled features for that symbol's rows t-L+1 .. t   -> shape [L, F]
    X_flat[i] = X_seq[i] flattened                                    -> shape [L*F]
Windows may contain rows whose own label is NaN (unchanged days, earlier fold blocks):
they are past *inputs* and are always allowed. A window never contains rows after t.
A window with any missing input value is skipped (never filled in) and counted in `n_missing`.

The scaler is fitted on training-fold rows only and then applied everywhere.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

from .features import FEATURE_COLUMNS

META_COLUMNS = ["symbol", "date", "label", "regime", "trend_regime", "vol_regime", "ret_1d", "fwd_ret"]


@dataclass
class WindowSet:
    X_seq: np.ndarray  # [N, L, F] float32
    y: np.ndarray | None  # [N] int64; None for days whose outcome is not known yet (live prediction)
    meta: pd.DataFrame  # one row per sample (META_COLUMNS)
    n_missing: int = 0  # requested samples skipped because their window had a missing value

    @property
    def X_flat(self) -> np.ndarray:
        return self.X_seq.reshape(len(self.X_seq), -1)

    def __len__(self) -> int:
        return len(self.X_seq)


def fit_scaler(table: pd.DataFrame, train_dates: pd.DatetimeIndex) -> StandardScaler:
    rows = table[table["date"].isin(train_dates)]
    return StandardScaler().fit(rows[FEATURE_COLUMNS].to_numpy())


def build_windows(table: pd.DataFrame, samples: pd.DataFrame, scaler: StandardScaler, lookback: int,
                  labelled: bool = True) -> WindowSet:
    """`samples` is a subset of `table` rows (same index) to turn into windows.

    labelled=False is for days whose outcome is not known yet: the WindowSet then has y=None.
    """
    table = table.sort_values(["symbol", "date"])
    scaled = pd.DataFrame(
        scaler.transform(table[FEATURE_COLUMNS].to_numpy()).astype(np.float32), index=table.index
    )
    # Position of each row within its symbol's history, for window slicing.
    pos = table.groupby("symbol").cumcount()
    by_symbol = {s: scaled.loc[idx].to_numpy() for s, idx in table.groupby("symbol").groups.items()}

    keep, windows, n_missing = [], [], 0
    for row_id, row in samples.iterrows():
        p = int(pos.loc[row_id])
        if p + 1 < lookback:
            continue  # not enough history for a full window
        window = by_symbol[row["symbol"]][p + 1 - lookback : p + 1]
        if np.isnan(window).any():
            n_missing += 1  # a missing source value: skip the sample rather than invent a number
            continue
        windows.append(window)
        keep.append(row_id)

    meta = samples.loc[keep, [c for c in META_COLUMNS if c in samples.columns]].reset_index(drop=True)
    X = np.stack(windows) if windows else np.zeros((0, lookback, len(FEATURE_COLUMNS)), np.float32)
    y = meta["label"].astype(np.int64).to_numpy() if labelled else None
    return WindowSet(X_seq=X, y=y, meta=meta, n_missing=n_missing)
