import { Agent } from '@mastra/core/agent';
import { modelFor, SHARED_RULES, type AgentTeamOptions } from './types';

export function createReportAgent(options: AgentTeamOptions) {
  const { reportFormatter } = options.tools;

  return new Agent({
    id: 'report-agent',
    name: 'Report Agent',
    description:
      'Turns gathered facts and analysis into a polished Markdown research report with a disclaimer. ' +
      'Give it the findings from the other agents; it does not fetch data itself.',
    instructions: `You are the report writer for Colombo Stock Exchange (CSE) research.

You receive findings (facts and analysis) in the request. Turn them into a report:
1. Write a one-line headline, a 2-4 sentence summary, key metrics, signals, risks and a balanced conclusion.
2. Call report-formatter exactly once with those parts.
3. Reply with the markdown the tool returns, unchanged.

Use only the facts you were given. If something important is missing, say so in the summary instead of guessing.

${SHARED_RULES}`,
    model: modelFor(options, 'report'),
    tools: { reportFormatter },
  });
}
