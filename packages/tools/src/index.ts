import { createAnnouncementsTool } from './announcements-tool';
import { createCseSnapshotTool } from './cse-snapshot-tool';
import { createHistoricalMarketTool } from './historical-market-tool';
import { createMarketContextTool } from './market-context-tool';
import { createNotificationTool } from './notification-tool';
import { createReportFormatterTool } from './report-formatter-tool';
import { createSectorComparisonTool } from './sector-comparison-tool';
import { createSymbolRegistryTool } from './symbol-registry-tool';
import { createTechnicalAnalysisTool } from './technical-analysis-tool';
import type { CseToolDeps } from './types';
import { createWatchlistStoreTool } from './watchlist-store-tool';

export * from './domain';
export * from './types';
export * from './indicators';
export { getUserId } from './context';
export { RESEARCH_DISCLAIMER, formatReportMarkdown } from './report-formatter-tool';
export {
  createAnnouncementsTool,
  createCseSnapshotTool,
  createHistoricalMarketTool,
  createMarketContextTool,
  createNotificationTool,
  createReportFormatterTool,
  createSectorComparisonTool,
  createSymbolRegistryTool,
  createTechnicalAnalysisTool,
  createWatchlistStoreTool,
};

/** Builds every CSE tool, wired to the host application's data ports. */
export function createCseTools(deps: CseToolDeps) {
  return {
    symbolRegistry: createSymbolRegistryTool(deps),
    cseSnapshot: createCseSnapshotTool(deps),
    historicalMarket: createHistoricalMarketTool(deps),
    announcements: createAnnouncementsTool(deps),
    technicalAnalysis: createTechnicalAnalysisTool(deps),
    marketContext: createMarketContextTool(deps),
    sectorComparison: createSectorComparisonTool(deps),
    reportFormatter: createReportFormatterTool(),
    watchlistStore: createWatchlistStoreTool(deps),
    notification: createNotificationTool(deps),
  };
}

export type CseTools = ReturnType<typeof createCseTools>;
