import { Controller, Get, Param, Post } from '@nestjs/common';
import { CseService } from './cse.service';

@Controller()
export class CseController {
  constructor(private readonly cseService: CseService) {}

  @Get('symbols')
  getSymbols() {
    return this.cseService.getSecurityMaster();
  }

  @Get('market/summary')
  getMarketSummary() {
    return this.cseService.getMarketSummary();
  }

  @Get('market/indexes')
  getMarketIndexes() {
    return this.cseService.getMarketIndexes();
  }

  @Get('analysis/:symbol')
  getAnalysis(@Param('symbol') symbol: string) {
    return this.cseService.getAnalysis(symbol);
  }

  @Get('analysis/:symbol/history')
  getHistory(@Param('symbol') symbol: string) {
    return this.cseService.getHistoricalBars(symbol);
  }

  @Get('analysis/:symbol/announcements')
  getAnnouncements(@Param('symbol') symbol: string) {
    return this.cseService.getAnnouncements(symbol);
  }

  @Post('ingest/symbols')
  ingestSymbols() {
    return this.cseService.ingestSymbols();
  }

  @Post('ingest/all')
  ingestAll() {
    return this.cseService.ingestAll();
  }
}