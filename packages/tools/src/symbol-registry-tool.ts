import { ToolContext, ToolResult } from './types';

export class SymbolRegistryTool {
  async execute(context: ToolContext): Promise<ToolResult<{ symbol: string; companyName: string; sector: string }[]>> {
    const registry = [
      { symbol: 'JKH.N0000', companyName: 'John Keells Holdings PLC', sector: 'Diversified Holdings' },
      { symbol: 'HNB.N0000', companyName: 'Hatton National Bank PLC', sector: 'Banking and Finance' },
      { symbol: 'COMB.N0000', companyName: 'Commercial Bank of Ceylon PLC', sector: 'Banking and Finance' },
    ];

    const normalized = context.symbol.trim().toUpperCase();
    const matches = registry.filter((item) => item.symbol.includes(normalized) || normalized.includes(item.symbol.split('.')[0]));

    return {
      ok: true,
      data: matches.length > 0 ? matches : registry,
    };
  }
}
