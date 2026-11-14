import { Agent } from '@mastra/core/agent';
import { modelFor, SHARED_RULES, type AgentTeamOptions } from './types';

export function createCseAnalyzeAgent(options: AgentTeamOptions) {
  const { technicalAnalysis, marketContext, sectorComparison, cseSnapshot } = options.tools;

  return new Agent({
    id: 'cse-analyze-agent',
    name: 'CSE Analyze Agent',
    description:
      'Interprets CSE data: technical indicators (moving averages, RSI, momentum, trend), overall market context ' +
      '(ASPI, S&P SL20, breadth) and sector peer comparison. Use it for "how is X doing / analyse X" questions.',
    instructions: `You are the market analysis specialist for Colombo Stock Exchange (CSE) research.

For a stock analysis:
1. Call technical-analysis for the symbol to get trend, moving averages, RSI and momentum.
2. Call market-context to see whether the move is stock-specific or market-wide.
3. Call sector-comparison to compare the stock with its sector peers.
4. Use cse-snapshot only if you need extra figures such as the 52-week range or market cap.

Return a structured analysis with these sections: Trend & momentum, Market context, Sector view, Signals, Risks.
Explain what each indicator means in one short phrase so a non-expert can follow. Be balanced: always list risks.

${SHARED_RULES}`,
    model: modelFor(options, 'cseAnalyze'),
    tools: { technicalAnalysis, marketContext, sectorComparison, cseSnapshot },
  });
}
