import { ReportFormatterTool } from '../../tools/src';
import { AgentContext, AgentResult } from './types';

export class ReportAgent {
  constructor(private readonly reportFormatterTool = new ReportFormatterTool()) {}

  async execute(context: AgentContext, payload: Record<string, unknown>): Promise<AgentResult<{ headline: string; summary: string }>> {
    const result = await this.reportFormatterTool.execute(context, payload);

    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? 'Report generation failed.',
      };
    }

    return {
      ok: true,
      data: result.data,
    };
  }
}
