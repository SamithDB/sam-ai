# CSE historical-data spike (2026-11-14)

Goal: find out whether cse.lk can supply multi-year daily OHLCV for ~10 liquid stocks
plus ASPI and S&P SL20, as the thesis needs (regimes 2019-2024).

Script: `research/scripts/cse_public_spike.py` (stdlib only).
Raw output: `research/data/raw/cse_public_1y/<date>/` (git-ignored).

## Result: public API = 1 year only; longer history is behind a paid CSE login

| Endpoint (POST, form-encoded, `https://www.cse.lk/api/`) | Params | What it returns | Auth |
|---|---|---|---|
| `companyInfoSummery` | `symbol=JKH.N0000` | Snapshot; `reqSymbolInfo.id` is the `stockId` for charts | none |
| `companyChartDataByStock` | `stockId`, `period` 1=1D 2=1W 3=1M 4=3M **5=1Y** (others fall back to 1W) | Daily bars: `t` epoch ms, `p` close, `h`, `l`, `q` share volume. **`o` (open) is always null** | none |
| `chartData` | `chartId` (1=ASPI, 40=S&P SL20), `period=5` | Daily index close `v`, `%` change `pc`, time `d`. No OHL | none |
| `aspiData`, `snpData` | — | Latest index tick only | none |
| `dailyMarketSummery` | — | Last 2 days of market-wide stats | none |
| `charts`, `historicalTrades` | `symbol`, `fromDate`, `toDate`, `period` (int) | Date-range OHLC history | **Login (identity.cse.lk) + paid "package"**: returns 404 without a session; the site says *"No chart data is available for the selected date range under your current package. Please upgrade your package"* |
| `corporateCompanyCalender`, `getFinancialAnnouncement`, `approvedAnnouncement` | various | Corporate events (useful for split/rights adjustments) | not yet tested |

We did not try to get around the login. The paid endpoints should only be used under a valid subscription, and only within its terms.

## Audit of the free 1-year data (2025-11-17 → 2026-11-13)

- 19 of 20 candidates returned about 243 bars. `EXPO.N0000` returned nothing (wrong symbol or delisted).
- The **open price is missing for every bar**. That rules out open-based features (gaps, candle body) unless another source provides them.
- **Many unchanged closes**: JKH 24.8%, SAMP 16.9%, LIOC 16.5%, CARG 14.5%, CINS 70.9%. The handling of zero returns in the labels is a primary design decision, not an edge case.
- CINS (190 bars, 71% unchanged) and CTC/CARG (median volume < 2k shares) are not liquid enough.
- JKH's all-time high is 430.25 against a current price of about 19. Past subdivisions mean any history from CSE must be checked for **split adjustment**.

## Implications

1. One year of data (~240 bars) can't support walk-forward deep learning or a regime study. It is still useful as a **development dataset** and for checking a paid or official source against it.
2. Options for 2015–2026 history, in order of preference:
   1. **An official academic data request to CSE** (Market Data / Research), supported by a letter from the supervisor. This gives citable provenance.
   2. **A CSE web subscription** that includes historical data. Check the package and its terms first (personal or research use; whether automated download is allowed).
   3. A licensed third-party vendor. Document the licence.
3. Whichever source is used, keep the raw dumps immutable and record the provenance here.
