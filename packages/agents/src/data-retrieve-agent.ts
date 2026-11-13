import { SymbolRegistryTool, CseSnapshotTool, HistoricalMarketTool, AnnouncementsTool } from '../../tools/src';
import { AgentContext, AgentResult } from './types';

export class DataRetrieveAgent {
  constructor(
    private readonly symbolRegistryTool = new SymbolRegistryTool(),
    private readonly cseSnapshotTool = new CseSnapshotTool(),
    private readonly historicalMarketTool = new HistoricalMarketTool(),
    private readonly announcementsTool = new AnnouncementsTool(),
  ) {}

  async execute(context: AgentContext): Promise<AgentResult<{ symbol: string; snapshot: unknown; history: unknown; announcements: unknown }>> {
    const symbolResult = await this.symbolRegistryTool.execute(context);
    const snapshotResult = await this.cseSnapshotTool.execute(context);
    const historyResult = await this.historicalMarketTool.execute(context);
    const announcementsResult = await this.announcementsTool.execute(context);

    return {
      ok: symbolResult.ok && snapshotResult.ok && historyResult.ok && announcementsResult.ok,
      data: {
        symbol: context.symbol,
        snapshot: snapshotResult.data,
        history: historyResult.data,
        announcements: announcementsResult.data,
      },
    };
  }
}
