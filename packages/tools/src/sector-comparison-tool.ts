import { ToolContext, ToolResult } from './types';

export class SectorComparisonTool {
  async execute(context: ToolContext): Promise<ToolResult<{ sector: string; relativeStrength: string; peers: string[] }>> {
    return {
      ok: true,
      data: {
        sector: 'Banking and Finance',
        relativeStrength: 'Above sector average',
        peers: ['HNB.N0000', 'COMB.N0000'],
      },
    };
  }
}
