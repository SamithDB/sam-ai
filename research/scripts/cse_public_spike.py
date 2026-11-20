"""CSE public-API historical-data spike.

Downloads what the *unauthenticated* cse.lk API exposes (about 1 year of daily bars
per stock, plus ASPI and S&P SL20) into an immutable raw folder, then prints a
quick audit per stock. Stdlib only, so it runs before the research env exists.

Usage (from repo root):
    python -I research/scripts/cse_public_spike.py [--out research/data/raw/cse_public_1y]

Endpoints are unofficial and undocumented; see research/docs/cse-data-spike.md.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://www.cse.lk/api/"
USER_AGENT = "Mozilla/5.0 (research-client)"
PERIOD_1Y = "5"  # companyChartDataByStock / chartData: 1=1D 2=1W 3=1M 4=3M 5=1Y (max public)
INDEX_CHART_IDS = {"ASPI": "1", "SPSL20": "40"}

# Candidate liquid stocks; the final 10 are chosen by the audit, not by this list.
CANDIDATES = [
    "JKH", "COMB", "HNB", "SAMP", "NDB", "SEYB", "LOLC", "LFIN", "DIAL", "SLTL",
    "HAYL", "HHL", "CTC", "CARG", "MELS", "LIOC", "EXPO", "DIPD", "AEL", "CINS",
]


def post(endpoint: str, **params: str) -> object:
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(
        BASE + endpoint,
        data=data,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def day(ms: int) -> str:
    # CSE timestamps are epoch ms; shift to Asia/Colombo (UTC+05:30) before taking the date.
    return (dt.datetime.fromtimestamp(ms / 1000, dt.UTC) + dt.timedelta(hours=5, minutes=30)).date().isoformat()


def save(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")


def audit_stock(symbol: str, bars: list[dict]) -> dict:
    closes = [b.get("p") for b in bars]
    n = len(bars)
    zero_ret = sum(1 for a, b in zip(closes, closes[1:]) if a is not None and a == b)
    zero_vol = sum(1 for b in bars if not b.get("q"))
    return {
        "symbol": symbol,
        "bars": n,
        "first": day(bars[0]["t"]) if bars else None,
        "last": day(bars[-1]["t"]) if bars else None,
        "open_missing_pct": round(100 * sum(1 for b in bars if b.get("o") is None) / n, 1) if n else None,
        "zero_return_pct": round(100 * zero_ret / max(n - 1, 1), 1),
        "zero_volume_pct": round(100 * zero_vol / n, 1) if n else None,
        "median_volume": sorted(b.get("q") or 0 for b in bars)[n // 2] if n else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="research/data/raw/cse_public_1y")
    parser.add_argument("--delay", type=float, default=1.0, help="seconds between requests (be polite)")
    args = parser.parse_args()

    run_dir = Path(args.out) / dt.date.today().isoformat()
    (run_dir / "stocks").mkdir(parents=True, exist_ok=True)
    (run_dir / "indexes").mkdir(parents=True, exist_ok=True)
    fetched_at = dt.datetime.now(dt.UTC).isoformat()

    for name, chart_id in INDEX_CHART_IDS.items():
        payload = post("chartData", chartId=chart_id, period=PERIOD_1Y)
        save(run_dir / "indexes" / f"{name}.json", {"fetched_at": fetched_at, "chartId": chart_id, "data": payload})
        print(f"{name}: {len(payload)} daily closes")
        time.sleep(args.delay)

    rows = []
    for code in CANDIDATES:
        symbol = f"{code}.N0000"
        try:
            info = post("companyInfoSummery", symbol=symbol)
            stock_id = info["reqSymbolInfo"]["id"]
            time.sleep(args.delay)
            chart = post("companyChartDataByStock", stockId=str(stock_id), period=PERIOD_1Y)
            bars = chart.get("chartData", [])
            save(
                run_dir / "stocks" / f"{symbol}.json",
                {"fetched_at": fetched_at, "symbol": symbol, "stockId": stock_id, "info": info, "chart": chart},
            )
            rows.append(audit_stock(symbol, bars))
        except Exception as exc:  # noqa: BLE001 - spike: record and continue
            rows.append({"symbol": symbol, "error": str(exc)})
        time.sleep(args.delay)

    save(run_dir / "audit.json", rows)
    cols = ["symbol", "bars", "first", "last", "open_missing_pct", "zero_return_pct", "zero_volume_pct", "median_volume"]
    print("\t".join(cols))
    for r in rows:
        print("\t".join(str(r.get(c, r.get("error", ""))) for c in cols))
    print(f"\nRaw data written to {run_dir}")


if __name__ == "__main__":
    main()
