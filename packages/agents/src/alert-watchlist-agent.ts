import { WatchlistStoreTool, NotificationTool } from '../../tools/src';
import { AgentContext, AgentResult } from './types';

export class AlertWatchlistAgent {
  constructor(
    private readonly watchlistStoreTool = new WatchlistStoreTool(),
    private readonly notificationTool = new NotificationTool(),
  ) {}

  async execute(context: AgentContext): Promise<AgentResult<{ watchlist: unknown; notification: unknown }>> {
    const watchlist = await this.watchlistStoreTool.execute(context);
    const notification = await this.notificationTool.execute(context);

    return {
      ok: watchlist.ok && notification.ok,
      data: {
        watchlist: watchlist.data,
        notification: notification.data,
      },
    };
  }
}
