export type AgentResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export type AgentContext = {
  symbol: string;
  userId?: string;
  timeRange?: string;
};
