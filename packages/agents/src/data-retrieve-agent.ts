import { Agent } from '@mastra/core/agent';
import { modelFor, SHARED_RULES, type AgentTeamOptions } from './types';

export function createDataRetrieveAgent(options: AgentTeamOptions) {
  const { symbolRegistry, cseSnapshot, historicalMarket, announcements } = options.tools;

  return new Agent({
    id: 'data-retrieve-agent',
    name: 'Data Retrieve Agent',
    description:
      'Fetches raw CSE facts: resolves company names to symbols, latest price snapshots, daily price history and ' +
      'corporate announcements. Use it for "what is the price / history / news" questions. It does not interpret data.',
    instructions: `You are the data retrieval specialist for Colombo Stock Exchange (CSE) research.

Your job is to fetch facts with your tools and return them accurately and concisely:
1. If the request names a company rather than a symbol, call symbol-registry first.
2. Use cse-snapshot for the latest price data, historical-market for price history, announcements for corporate news.
3. Return the key figures in a compact, structured form (short bullet list or small table) with the trading date.
4. Do not analyse, forecast or give opinions; that is another agent's job.

${SHARED_RULES}`,
    model: modelFor(options, 'dataRetrieve'),
    tools: { symbolRegistry, cseSnapshot, historicalMarket, announcements },
  });
}
