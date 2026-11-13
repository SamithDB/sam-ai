export type ToolResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export type ToolContext = {
  symbol: string;
  timeRange?: string;
  userId?: string;
};
