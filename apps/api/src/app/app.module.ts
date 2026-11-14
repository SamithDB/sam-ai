import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CseController } from '../cse/cse.controller';
import { CseService } from '../cse/cse.service';
import { MastraService } from '../mastra/mastra.service';
import { AgentsController } from '../mastra/agents.controller';
import { DatabaseService } from '../database/database.service';
import { envFilePaths, validateEnv } from '../config/env';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: envFilePaths,
      validate: validateEnv,
    }),
  ],
  controllers: [AppController, CseController, AgentsController],
  providers: [AppService, CseService, DatabaseService, MastraService],
})
export class AppModule {}
