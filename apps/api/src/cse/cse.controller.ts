import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CseService } from './cse.service';

/** Live CSE data (cse.lk) and real stored daily history. No sample data. */
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

  @Get('market/sectors')
  getSectors() {
    return this.cseService.getSectors();
  }

  @Get('announcements')
  getLatestAnnouncements() {
    return this.cseService.getAnnouncements();
  }

  @Get('analysis/:symbol')
  getAnalysis(@Param('symbol') symbol: string) {
    return this.cseService.getAnalysis(symbol);
  }

  @Get('analysis/:symbol/snapshot')
  getSnapshot(@Param('symbol') symbol: string) {
    return this.cseService.getCompanySnapshot(symbol);
  }

  @Get('analysis/:symbol/history')
  getHistory(@Param('symbol') symbol: string, @Query('days', new DefaultValuePipe(60), ParseIntPipe) days: number) {
    return this.cseService.getHistoricalBars(symbol, days);
  }

  @Get('analysis/:symbol/announcements')
  getAnnouncements(@Param('symbol') symbol: string) {
    return this.cseService.getAnnouncements(symbol);
  }
}
