"""Loaders that turn raw source dumps into tidy daily panels.

Output schema (one row per symbol x trading day, sorted):
    symbol, date, close, high, low, volume, open (NaN when the source lacks it)
Index series: date, aspi, spsl20
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

COLOMBO_TZ = "Asia/Colombo"


def _to_date(ms: pd.Series) -> pd.Series:
    return pd.to_datetime(ms, unit="ms", utc=True).dt.tz_convert(COLOMBO_TZ).dt.tz_localize(None).dt.normalize()


def latest_run_dir(raw_root: Path) -> Path:
    runs = sorted(p for p in raw_root.iterdir() if p.is_dir())
    if not runs:
        raise FileNotFoundError(f"No raw runs under {raw_root}. Run research/scripts/cse_public_spike.py first.")
    return runs[-1]


def load_public_stocks(run_dir: Path, symbols: list[str]) -> pd.DataFrame:
    frames = []
    for symbol in symbols:
        path = run_dir / "stocks" / f"{symbol}.json"
        if not path.exists():
            raise FileNotFoundError(f"Missing raw file for {symbol}: {path}")
        bars = json.loads(path.read_text(encoding="utf-8"))["chart"]["chartData"]
        if not bars:
            raise ValueError(f"{symbol}: source returned no bars")
        df = pd.DataFrame(bars)
        frames.append(
            pd.DataFrame(
                {
                    "symbol": symbol,
                    "date": _to_date(df["t"]),
                    "open": pd.to_numeric(df["o"], errors="coerce"),
                    "high": pd.to_numeric(df["h"], errors="coerce"),
                    "low": pd.to_numeric(df["l"], errors="coerce"),
                    "close": pd.to_numeric(df["p"], errors="coerce"),
                    "volume": pd.to_numeric(df["q"], errors="coerce"),
                }
            )
        )
    panel = pd.concat(frames, ignore_index=True)
    return _clean(panel)


def load_public_indexes(run_dir: Path) -> pd.DataFrame:
    series = {}
    for name, column in (("ASPI", "aspi"), ("SPSL20", "spsl20")):
        data = json.loads((run_dir / "indexes" / f"{name}.json").read_text(encoding="utf-8"))["data"]
        df = pd.DataFrame(data)
        s = pd.Series(pd.to_numeric(df["v"], errors="coerce").to_numpy(), index=_to_date(df["d"]), name=column)
        series[column] = s[~s.index.duplicated(keep="last")]
    out = pd.concat(series.values(), axis=1).sort_index()
    out.index.name = "date"
    return out.reset_index()


def _clean(panel: pd.DataFrame) -> pd.DataFrame:
    panel = panel.dropna(subset=["close"])
    panel = panel[panel["close"] > 0]
    # Keep the last record when a source repeats a day (e.g. intraday refresh of the latest bar).
    panel = panel.sort_values(["symbol", "date"]).drop_duplicates(["symbol", "date"], keep="last")
    return panel.reset_index(drop=True)


def audit(panel: pd.DataFrame) -> pd.DataFrame:
    """Per-symbol data-quality summary for the audit report."""

    def one(g: pd.DataFrame) -> pd.Series:
        ret = g["close"].pct_change()
        return pd.Series(
            {
                "bars": len(g),
                "first": g["date"].min().date(),
                "last": g["date"].max().date(),
                "open_missing_pct": round(100 * g["open"].isna().mean(), 1),
                "zero_return_pct": round(100 * (ret.iloc[1:] == 0).mean(), 1),
                "zero_volume_pct": round(100 * (g["volume"] == 0).mean(), 1),
                "volume_missing_pct": round(100 * g["volume"].isna().mean(), 1),
                "median_volume": g["volume"].median(),
                "max_abs_daily_return_pct": round(100 * ret.abs().max(), 1),
            }
        )

    return panel.groupby("symbol").apply(one, include_groups=False)
