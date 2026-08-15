# CSE Data Ingestion Spec

## Purpose
Use the CSE website APIs as a live market data source, then store the results in our own database so the AI system can analyze both current snapshots and long historical trends.

## Important Constraint
The CSE endpoints appear to be unofficial and reverse-engineered. The app should treat them as a best-effort source, cache aggressively, and never assume the contract is stable.

## Data Sources To Use First
- `allSecurityCode` for the symbol master list.
- `companyInfoSummery` for single-stock snapshots.
- `todaySharePrice` for current price data.
- `tradeSummary` for trading activity.
- `aspiData` for market index history.
- `snpData` for S&P SL20 history.
- `dailyMarketSummery` for daily market-wide context.
- `allSectors` for sector classification and sector-level context.
- `approvedAnnouncement` for event-driven analysis.

## Database Tables

### 1. `cse_security_master`
Stores the master list of symbols and company identifiers.

Suggested fields:
- `id`
- `symbol`
- `company_id`
- `company_name`
- `sector_name`
- `instrument_type`
- `is_active`
- `source_payload_json`
- `last_synced_at`

### 2. `cse_company_snapshot`
Stores the latest snapshot for a stock.

Suggested fields:
- `id`
- `symbol`
- `traded_date`
- `last_traded_price`
- `previous_close`
- `open_price`
- `high_price`
- `low_price`
- `change_value`
- `change_percent`
- `volume`
- `turnover`
- `market_cap`
- `beta`
- `foreign_holdings`
- `week_52_high`
- `week_52_low`
- `ytd_high`
- `ytd_low`
- `source_payload_json`
- `fetched_at`

### 3. `cse_price_bars`
Stores historical OHLC-style data used for technical analysis.

Suggested fields:
- `id`
- `symbol`
- `bar_date`
- `open_price`
- `high_price`
- `low_price`
- `close_price`
- `volume`
- `turnover`
- `trade_count`
- `vwap`
- `source`
- `fetched_at`

### 4. `cse_market_index_daily`
Stores ASPI and S&P SL20 index history.

Suggested fields:
- `id`
- `index_code`
- `bar_date`
- `open_value`
- `high_value`
- `low_value`
- `close_value`
- `change_value`
- `change_percent`
- `volume`
- `turnover`
- `source_payload_json`
- `fetched_at`

### 5. `cse_market_summary_daily`
Stores market-wide daily statistics.

Suggested fields:
- `id`
- `bar_date`
- `advancers`
- `decliners`
- `unchanged`
- `total_turnover`
- `total_volume`
- `market_status`
- `source_payload_json`
- `fetched_at`

### 6. `cse_sector_daily`
Stores sector-level information for comparisons.

Suggested fields:
- `id`
- `sector_name`
- `bar_date`
- `sector_index_value`
- `change_value`
- `change_percent`
- `turnover`
- `volume`
- `source_payload_json`
- `fetched_at`

### 7. `cse_announcement`
Stores approved company announcements.

Suggested fields:
- `id`
- `symbol`
- `announcement_id`
- `announcement_date`
- `title`
- `summary`
- `category`
- `url`
- `source_payload_json`
- `fetched_at`

### 8. `cse_ingestion_run`
Tracks each job execution for debugging and observability.

Suggested fields:
- `id`
- `job_name`
- `started_at`
- `finished_at`
- `status`
- `records_inserted`
- `records_updated`
- `error_message`

## Ingestion Jobs

### Job 1: Symbol Master Sync
- Endpoint: `allSecurityCode`
- Frequency: daily, before the market opens
- Purpose: keep the symbol registry current

### Job 2: Live Snapshot Sync
- Endpoints: `companyInfoSummery`, `todaySharePrice`, `tradeSummary`
- Frequency: every 5 to 15 minutes during market hours
- Purpose: keep current prices and trading metrics fresh

### Job 3: Historical Market Sync
- Endpoints: `aspiData`, `snpData`, `dailyMarketSummery`, `allSectors`
- Frequency: once daily after market close
- Purpose: build research-grade time series and market context

### Job 4: Announcement Sync
- Endpoint: `approvedAnnouncement`
- Frequency: every 30 to 60 minutes during market hours, then daily after close
- Purpose: capture event-driven catalysts and disclosures

## Suggested API Layer For Our App

### Public analysis endpoints
- `GET /analysis/:symbol`
- `GET /analysis/:symbol/history`
- `GET /analysis/:symbol/news`
- `GET /market/summary`
- `GET /market/indexes`
- `GET /watchlist`
- `POST /watchlist`

### Internal ingestion endpoints or jobs
- `POST /ingest/symbols`
- `POST /ingest/snapshots`
- `POST /ingest/market`
- `POST /ingest/announcements`
- `POST /ingest/all`

## Processing Flow
1. Sync the symbol master list.
2. Resolve each symbol to a company ID.
3. Pull live snapshot data for the chosen symbols.
4. Store snapshots and append daily bars.
5. Pull market-wide and sector context.
6. Pull announcements and attach them to the relevant symbol.
7. Let Mastra read from the database, not directly from the CSE API, for analysis.

## Why This Structure Works
- It separates unstable live endpoints from stable stored data.
- It supports both current analysis and long-horizon research.
- It gives the AI agent structured inputs instead of raw web responses.
- It makes observability and evaluation much easier later.
