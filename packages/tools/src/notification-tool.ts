import { ToolContext, ToolResult } from './types';

export class NotificationTool {
  async execute(context: ToolContext): Promise<ToolResult<{ channel: string; message: string }>> {
    return {
      ok: true,
      data: {
        channel: 'dashboard',
        message: `Alert fired for ${context.symbol}.`,
      },
    };
  }
}
