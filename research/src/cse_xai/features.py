"""Trailing-only features, organised in the proposal's six feature groups.

Rule: the value at row t may only use data from days <= t. `tests/test_leakage.py`
enforces this by perturbing the future and checking that past features don't move.

Raw price levels are deliberately excluded (non-stationary). The PRICE group uses
ratios such as close / SMA and the candle range instead.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

FEATURE_GROUPS: dict[str, list[str]] = {
    "price": ["close_sma5_ratio", "close_sma20_ratio", "hl_range"],
    "returns": ["ret_1d", "ret_2d", "ret_5d", "ret_10d", "ret_1d_lag1", "ret_1d_lag2"],
    "technical": ["rsi_14", "macd_hist", "momentum_10"],
    "activity": ["log_volume_z20", "turnover_proxy_z20"],
    "risk": ["vol_5", "vol_20"],
    "market": ["aspi_ret_1d", "aspi_ret_5d", "spsl20_ret_1d", "spsl20_ret_5d"],
}
FEATURE_COLUMNS: list[str] = [c for cols in FEATURE_GROUPS.values() for c in cols]
WARMUP_DAYS = 34  # longest trailing window used below (MACD slow EMA 26 + signal 9 - 1)


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).where(loss > 0, 100.0).where(gain.notna())


def _zscore(x: pd.Series, window: int) -> pd.Series:
    mean = x.rolling(window, min_periods=window).mean()
    std = x.rolling(window, min_periods=window).std()
    return (x - mean) / std.replace(0, np.nan)


def stock_features(g: pd.DataFrame) -> pd.DataFrame:
    """Features for one symbol. `g` must be sorted by date."""
    c = g["close"]
    r = np.log(c).diff()
    out = pd.DataFrame(index=g.index)

    out["close_sma5_ratio"] = c / c.rolling(5, min_periods=5).mean() - 1
    out["close_sma20_ratio"] = c / c.rolling(20, min_periods=20).mean() - 1
    out["hl_range"] = (g["high"] - g["low"]) / c

    out["ret_1d"] = r
    out["ret_2d"] = np.log(c / c.shift(2))
    out["ret_5d"] = np.log(c / c.shift(5))
    out["ret_10d"] = np.log(c / c.shift(10))
    out["ret_1d_lag1"] = r.shift(1)
    out["ret_1d_lag2"] = r.shift(2)

    out["rsi_14"] = _rsi(c) / 100.0
    ema12 = c.ewm(span=12, adjust=False, min_periods=12).mean()
    ema26 = c.ewm(span=26, adjust=False, min_periods=26).mean()
    macd = ema12 - ema26
    out["macd_hist"] = (macd - macd.ewm(span=9, adjust=False, min_periods=9).mean()) / c
    out["momentum_10"] = c / c.shift(10) - 1

    # A missing volume stays missing (NaN); windows that contain it are skipped, never filled in.
    log_vol = np.log1p(g["volume"])
    out["log_volume_z20"] = _zscore(log_vol, 20)
    out["turnover_proxy_z20"] = _zscore(np.log1p(g["volume"] * c), 20)

    out["vol_5"] = r.rolling(5, min_periods=5).std()
    out["vol_20"] = r.rolling(20, min_periods=20).std()
    return out


def market_features(indexes: pd.DataFrame) -> pd.DataFrame:
    idx = indexes.sort_values("date").set_index("date")
    out = pd.DataFrame(index=idx.index)
    for col in ("aspi", "spsl20"):
        out[f"{col}_ret_1d"] = np.log(idx[col]).diff()
        out[f"{col}_ret_5d"] = np.log(idx[col] / idx[col].shift(5))
    return out


def build_features(panel: pd.DataFrame, indexes: pd.DataFrame) -> pd.DataFrame:
    """panel (symbol, date, OHLCV) + index closes -> panel with FEATURE_COLUMNS added.

    Market features are joined on the stock's trading date. If an index value is
    missing for that date we use the last *earlier* index value (backward as-of join),
    never a later one.
    """
    panel = panel.sort_values(["symbol", "date"]).reset_index(drop=True)
    feats = panel.groupby("symbol", group_keys=False)[["close", "high", "low", "volume"]].apply(stock_features)
    out = pd.concat([panel, feats], axis=1)

    mkt = market_features(indexes).reset_index().sort_values("date")
    out = pd.merge_asof(out.sort_values("date"), mkt, on="date", direction="backward")
    return out.sort_values(["symbol", "date"]).reset_index(drop=True)
