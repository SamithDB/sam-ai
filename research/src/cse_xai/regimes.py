"""Transparent, trailing-only market-regime labels: trend x volatility.

trend_t  = bull     if close_t / close_{t-W} - 1 >  threshold
         = bear     if                            < -threshold
         = sideways otherwise
vol_t    = high if rolling std of log returns over `vol_window` days is above its own
           trailing median over `vol_reference_window` days, else low.

Both use only data up to and including day t, so regimes may also be used as model
inputs without leakage. Rows inside the warm-up period get regime = NaN.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import RegimeConfig


def _regimes_for_series(close: pd.Series, cfg: RegimeConfig) -> pd.DataFrame:
    trailing = close / close.shift(cfg.trend_window) - 1
    trend = pd.Series(np.where(trailing > cfg.trend_threshold, "bull",
                               np.where(trailing < -cfg.trend_threshold, "bear", "sideways")), index=close.index)
    trend[trailing.isna()] = np.nan

    vol = np.log(close).diff().rolling(cfg.vol_window, min_periods=cfg.vol_window).std()
    ref = vol.rolling(cfg.vol_reference_window, min_periods=cfg.vol_reference_window // 2).median()
    vol_regime = pd.Series(np.where(vol > ref, "high", "low"), index=close.index)
    vol_regime[vol.isna() | ref.isna()] = np.nan

    regime = trend.str.cat(vol_regime, sep="_")
    return pd.DataFrame({"trend_regime": trend, "vol_regime": vol_regime, "regime": regime})


def add_regimes(panel: pd.DataFrame, cfg: RegimeConfig, indexes: pd.DataFrame | None = None) -> pd.DataFrame:
    panel = panel.sort_values(["symbol", "date"]).reset_index(drop=True)
    if cfg.level == "stock":
        reg = panel.groupby("symbol", group_keys=False)["close"].apply(lambda s: _regimes_for_series(s, cfg))
        return pd.concat([panel, reg], axis=1)
    if cfg.level == "market":
        if indexes is None:
            raise ValueError("market-level regimes need the index frame")
        idx = indexes.sort_values("date").reset_index(drop=True)
        reg = pd.concat([idx[["date"]], _regimes_for_series(idx["aspi"], cfg)], axis=1)
        merged = pd.merge_asof(panel.sort_values("date"), reg, on="date", direction="backward")
        return merged.sort_values(["symbol", "date"]).reset_index(drop=True)
    raise ValueError(f"Unknown regime level: {cfg.level}")
