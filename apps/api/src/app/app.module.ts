import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { CseController } from '../cse/cse.controller';
import { CseService } from '../cse/cse.service';
import { MastraService } from '../mastra/mastra.service';
import { AgentsController } from '../mastra/agents.controller';
import { envFilePaths, validateEnv } from '../config/env';
import { ResearchController } from '../research/research.controller';
import { ResearchService } from '../research/research.service';
import { ResearchLiveService } from '../research/research-live.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: envFilePaths,
      validate: validateEnv,
    }),
  ],
  controllers: [AppController, CseController, AgentsController, ResearchController],
  providers: [CseService, MastraService, ResearchService, ResearchLiveService],
})
export class AppModule {}
