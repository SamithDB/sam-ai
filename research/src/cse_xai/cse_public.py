"""Client for the public (unauthenticated) cse.lk endpoints used by the data sync.

The endpoints are unofficial and undocumented (see docs/cse-data-spike.md). Only the
free endpoints are used: about one year of daily bars per stock, plus ASPI and S&P SL20.
Requests are spaced out by `delay` seconds to be polite to the exchange's servers.
"""

from __future__ import annotations

import datetime as dt
import json
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass

BASE = "https://www.cse.lk/api/"
USER_AGENT = "Mozilla/5.0 (research-client)"
PERIOD_1Y = "5"  # 1=1D 2=1W 3=1M 4=3M 5=1Y (the longest public period)
INDEX_CHART_IDS = {"aspi": "1", "spsl20": "40"}
SOURCE_STOCK = "cse.lk/companyChartDataByStock?period=1Y"
SOURCE_INDEX = "cse.lk/chartData?period=1Y"
COLOMBO = dt.timezone(dt.timedelta(hours=5, minutes=30))


def colombo_day(ms: int) -> str:
    """Epoch milliseconds -> trading date (YYYY-MM-DD) in Asia/Colombo."""
    return dt.datetime.fromtimestamp(ms / 1000, COLOMBO).date().isoformat()


def colombo_today() -> str:
    return dt.datetime.now(COLOMBO).date().isoformat()


def _num(x) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if v == v else None  # drop NaN


@dataclass
class CsePublicClient:
    delay: float = 1.0
    timeout: float = 60.0

    def _post(self, endpoint: str, **params: str) -> object:
        req = urllib.request.Request(
            BASE + endpoint,
            data=urllib.parse.urlencode(params).encode(),
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        finally:
            time.sleep(self.delay)

    def stock_bars(self, symbol: str) -> list[dict]:
        """Daily bars for one stock, oldest first: date, close, high, low, volume (open is never published)."""
        info = self._post("companyInfoSummery", symbol=symbol)
        stock_id = info["reqSymbolInfo"]["id"]
        chart = self._post("companyChartDataByStock", stockId=str(stock_id), period=PERIOD_1Y)
        bars: dict[str, dict] = {}
        for b in chart.get("chartData") or []:
            close = _num(b.get("p"))
            if b.get("t") is None or close is None or close <= 0:
                continue
            # A repeated day is an intraday refresh of the latest bar: keep the last one.
            bars[colombo_day(b["t"])] = {
                "close": close,
                "high": _num(b.get("h")),
                "low": _num(b.get("l")),
                "open": _num(b.get("o")),
                "volume": _num(b.get("q")),
            }
        return [{"date": d, **v} for d, v in sorted(bars.items())]

    def index_values(self, index: str) -> list[dict]:
        """Daily closing values of an index ("aspi" or "spsl20"), oldest first."""
        payload = self._post("chartData", chartId=INDEX_CHART_IDS[index], period=PERIOD_1Y)
        values: dict[str, float] = {}
        for p in payload or []:
            v = _num(p.get("v"))
            if p.get("d") is None or v is None:
                continue
            values[colombo_day(p["d"])] = v
        return [{"date": d, "value": v} for d, v in sorted(values.items())]
