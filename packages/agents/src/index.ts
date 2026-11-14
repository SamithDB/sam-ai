import { createAlertWatchlistAgent } from './alert-watchlist-agent';
import { createCseAnalyzeAgent } from './cse-analyze-agent';
import { createDataRetrieveAgent } from './data-retrieve-agent';
import { createReportAgent } from './report-agent';
import { createSupervisorAgent } from './supervisor-agent';
import type { AgentTeamOptions } from './types';

export * from './types';
export { SUPERVISOR_AGENT_ID } from './supervisor-agent';
export {
  createAlertWatchlistAgent,
  createCseAnalyzeAgent,
  createDataRetrieveAgent,
  createReportAgent,
  createSupervisorAgent,
};

/**
 * Builds the full agent team. Register the result with `new Mastra({ agents })`;
 * the keys become the agent names used by `mastra.getAgent(...)`.
 */
export function createAgentTeam(options: AgentTeamOptions) {
  const dataRetrieveAgent = createDataRetrieveAgent(options);
  const cseAnalyzeAgent = createCseAnalyzeAgent(options);
  const reportAgent = createReportAgent(options);
  const alertWatchlistAgent = createAlertWatchlistAgent(options);
  const supervisorAgent = createSupervisorAgent(options, {
    dataRetrieveAgent,
    cseAnalyzeAgent,
    reportAgent,
    alertWatchlistAgent,
  });

  return { supervisorAgent, dataRetrieveAgent, cseAnalyzeAgent, reportAgent, alertWatchlistAgent };
}

export type AgentTeam = ReturnType<typeof createAgentTeam>;
