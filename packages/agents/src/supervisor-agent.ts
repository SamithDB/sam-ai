import { AgentContext, AgentResult } from './types';

export class SupervisorAgent {
  async execute(context: AgentContext): Promise<AgentResult<{ route: string; summary: string }>> {
    return {
      ok: true,
      data: {
        route: 'data-retrieve -> cse-analyze -> report',
        summary: `Supervisor routed the request for ${context.symbol} through the research pipeline.`,
      },
    };
  }
}
