import { TechnicalAnalysisTool, MarketContextTool, SectorComparisonTool } from '../../tools/src';
import { AgentContext, AgentResult } from './types';

export class CseAnalyzeAgent {
  constructor(
    private readonly technicalAnalysisTool = new TechnicalAnalysisTool(),
    private readonly marketContextTool = new MarketContextTool(),
    private readonly sectorComparisonTool = new SectorComparisonTool(),
  ) {}

  async execute(context: AgentContext): Promise<AgentResult<{ signal: string; marketStatus: string; sectorSummary: string }>> {
    const technical = await this.technicalAnalysisTool.execute(context);
    const market = await this.marketContextTool.execute(context);
    const sector = await this.sectorComparisonTool.execute(context);

    if (!technical.ok || !market.ok || !sector.ok) {
      return {
        ok: false,
        error: 'CSE analysis could not complete.',
      };
    }

    return {
      ok: true,
      data: {
        signal: technical.data?.signal ?? 'Signal unavailable',
        marketStatus: market.data?.marketStatus ?? 'Unknown',
        sectorSummary: sector.data?.relativeStrength ?? 'Unknown',
      },
    };
  }
}
