import { Agent } from '@mastra/core/agent';
import { modelFor, SHARED_RULES, type AgentTeamOptions } from './types';

export function createCseAnalyzeAgent(options: AgentTeamOptions) {
  const { technicalAnalysis, marketContext, sectorPerformance, cseSnapshot } = options.tools;

  return new Agent({
    id: 'cse-analyze-agent',
    name: 'CSE Analyze Agent',
    description:
      'Interprets CSE data: technical indicators (moving averages, RSI, momentum, trend), overall market context ' +
      '(ASPI, S&P SL20, breadth) and sector index performance. Use it for "how is X doing / analyse X" questions.',
    instructions: `You are the market analysis specialist for Colombo Stock Exchange (CSE) research.

For a stock analysis:
1. Call technical-analysis for the symbol to get trend, moving averages, RSI and momentum.
2. Call market-context to see whether the move is stock-specific or market-wide.
3. Call sector-performance to see how the sectors moved today. cse.lk does not say which sector a company is in:
   only relate the stock to a sector when the sector is obvious from the company name or the user names it,
   and say that you are doing so.
4. Use cse-snapshot only if you need extra figures such as the 52-week range or market cap.

Return a structured analysis with these sections: Trend & momentum, Market context, Sector view, Signals, Risks.
Explain what each indicator means in one short phrase so a non-expert can follow. Be balanced: always list risks.

${SHARED_RULES}`,
    model: modelFor(options, 'cseAnalyze'),
    tools: { technicalAnalysis, marketContext, sectorPerformance, cseSnapshot },
  });
}
