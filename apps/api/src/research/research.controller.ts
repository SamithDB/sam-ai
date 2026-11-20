import { Controller, Get, Param, ParseBoolPipe, Post, Query } from '@nestjs/common';
import { ResearchLiveService } from './research-live.service';
import { ResearchService } from './research.service';

@Controller('research')
export class ResearchController {
  constructor(
    private readonly research: ResearchService,
    private readonly live: ResearchLiveService,
  ) {}

  @Get('experiments')
  listExperiments() {
    return this.research.listExperiments();
  }

  @Get('experiments/:name')
  getExperiment(@Param('name') name: string) {
    return this.research.getExperiment(name);
  }

  /** Stored-data coverage, prediction freshness and the latest sync job (from the Python service). */
  @Get('live/status')
  getLiveStatus() {
    return this.live.getDataStatus();
  }

  /** Fetch the public cse.lk year, insert missing bars, then rebuild predictions if the data changed. */
  @Post('live/sync')
  startSync(
    @Query('refresh', new ParseBoolPipe({ optional: true })) refresh?: boolean,
    @Query('force', new ParseBoolPipe({ optional: true })) force?: boolean,
  ) {
    return this.live.startSync({ refresh, force });
  }

  @Post('live/refresh')
  startRefresh(@Query('force', new ParseBoolPipe({ optional: true })) force?: boolean) {
    return this.live.startRefresh(force ?? false);
  }

  @Get('live/job')
  getCurrentJob() {
    return this.live.getCurrentJob();
  }

  @Get('live/predictions')
  listPredictions() {
    return this.live.listPredictions();
  }

  @Get('live/predictions/:symbol')
  getPrediction(@Param('symbol') symbol: string) {
    return this.live.getPrediction(symbol);
  }
}
