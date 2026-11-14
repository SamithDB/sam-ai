import { Agent } from '@mastra/core/agent';
import { modelFor, SHARED_RULES, type AgentTeamOptions } from './types';

export function createAlertWatchlistAgent(options: AgentTeamOptions) {
  const { watchlistStore, notification, symbolRegistry } = options.tools;

  return new Agent({
    id: 'alert-watchlist-agent',
    name: 'Alert & Watchlist Agent',
    description:
      "Manages the user's watchlist and price alerts: add/remove/list symbols, set alert-above / alert-below " +
      'thresholds, check which alerts have triggered and send dashboard notifications for them.',
    instructions: `You manage the user's CSE watchlist and price alerts.

- Use watchlist-store with action "add", "remove", "list" or "check-alerts".
- If the user names a company instead of a symbol, resolve it with symbol-registry first.
- When asked to check alerts, call watchlist-store with "check-alerts", then send one notification per triggered
  alert with the notification tool (title like "JKH.N0000 above 200"). Do not send notifications for anything else
  unless the user explicitly asks.
- Confirm every change back to the user with the resulting watchlist.

${SHARED_RULES}`,
    model: modelFor(options, 'alertWatchlist'),
    tools: { watchlistStore, notification, symbolRegistry },
  });
}
