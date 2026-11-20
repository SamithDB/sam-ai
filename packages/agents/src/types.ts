import type { CseTools, ResearchTools } from '@sam-ai/tools';

export type AgentRole = 'supervisor' | 'dataRetrieve' | 'cseAnalyze' | 'report' | 'alertWatchlist' | 'research';

export interface AgentTeamOptions {
  /** Tools from `createCseTools()`, already wired to the host's data ports. */
  tools: CseTools;
  /** Tools from `createResearchTools()`, wired to the research service. */
  researchTools: ResearchTools;
  /** Default model for every agent, as a Mastra model-router id, e.g. "openai/gpt-5-mini". */
  model: string;
  /** Optional per-role overrides, e.g. a stronger model for the supervisor. */
  models?: Partial<Record<AgentRole, string>>;
}

export const modelFor = (options: AgentTeamOptions, role: AgentRole): string => options.models?.[role] ?? options.model;

/** Shared guardrails appended to every agent's instructions. */
export const SHARED_RULES = `
Rules:
- Only use numbers that came from a tool result. Never invent prices, dates or figures.
- All data is real (live cse.lk or stored daily bars). If a tool fails or a value is null, say the data is unavailable;
  never estimate, interpolate or invent a missing figure.
- Do not give personalised investment advice or tell the user to buy, sell or hold. Present research, not recommendations.
- Prices are in Sri Lankan Rupees (LKR). Symbols look like "JKH.N0000"; a bare ticker like "JKH" is also accepted.
- If a symbol is unknown, say so and suggest using the symbol registry; do not guess.`.trim();
