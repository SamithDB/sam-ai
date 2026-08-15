# Mastra Stock Analysis AI Plan

## Goal
Turn this Nx starter into a stock data analysis AI app using Mastra for agents, workflows, memory, and observability.

## Phase 1: MVP Scope
- Search a stock symbol and fetch market data.
- Generate a short AI summary of price action, news, and fundamentals.
- Show a simple watchlist and one-click analysis view.
- Keep outputs structured and easy for the UI to render.

## Phase 2: Backend Architecture
- Keep `apps/api` as the public backend.
- Add a Mastra agent for stock analysis.
- Add tools for price history, news, fundamentals, and technical indicators.
- Add a workflow that validates a ticker, gathers data, and synthesizes a report.
- For CSE-specific research, use `CSE_INGESTION_SPEC.md` as the source-of-truth for symbols, snapshots, history, and announcements.

## Phase 3: Memory and Personalization
- Store user preferences like favorite symbols, time horizon, and risk profile.
- Reuse those preferences in future analyses.
- Keep the assistant focused on summaries and comparisons, not autonomous trading.

## Phase 4: UI
- Replace the current demo list in `apps/ui` with a stock dashboard.
- Add ticker search, watchlist, charts, AI summary, and news panels.
- Add a chat panel for follow-up questions.

## Phase 5: Observability and Quality
- Log tool usage, workflow steps, and model traces.
- Add evals for output structure and factual grounding.
- Cache market data to reduce provider costs and rate-limit issues.

## Recommended First Sprint
1. Choose a market data provider.
2. Add a `/analysis/:symbol` backend endpoint.
3. Implement one Mastra agent that generates a structured stock summary.
4. Wire the UI to call the endpoint and render the response.
