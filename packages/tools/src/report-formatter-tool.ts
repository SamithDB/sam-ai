import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const RESEARCH_DISCLAIMER =
  'This is an automated research summary for informational purposes only. It is not investment advice or a ' +
  'recommendation to buy or sell any security.';

export const reportInputSchema = z.object({
  symbol: z.string(),
  companyName: z.string(),
  headline: z.string().describe('One-line takeaway.'),
  summary: z.string().describe('2-4 sentence overview.'),
  keyMetrics: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  signals: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  conclusion: z.string(),
});

export function formatReportMarkdown(input: z.output<typeof reportInputSchema>): string {
  const lines: string[] = [`## ${input.companyName} (${input.symbol})`, '', `**${input.headline}**`, '', input.summary, ''];

  if (input.keyMetrics.length) {
    lines.push('| Metric | Value |', '| --- | --- |', ...input.keyMetrics.map((m) => `| ${m.label} | ${m.value} |`), '');
  }
  const section = (title: string, items: string[]) =>
    items.length ? [`### ${title}`, ...items.map((item) => `- ${item}`), ''] : [];
  lines.push(...section('Signals', input.signals), ...section('Risks', input.risks));
  lines.push('### Conclusion', input.conclusion, '', `_${RESEARCH_DISCLAIMER}_`);

  return lines.join('\n');
}

export function createReportFormatterTool() {
  return createTool({
    id: 'report-formatter',
    description:
      'Format a stock research report as consistent Markdown (headline, key metrics table, signals, risks, ' +
      'conclusion, disclaimer). Call this once the findings are gathered.',
    inputSchema: reportInputSchema,
    outputSchema: z.object({ markdown: z.string() }),
    execute: async (input) => ({ markdown: formatReportMarkdown(input) }),
  });
}
