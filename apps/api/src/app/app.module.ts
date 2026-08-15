import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CseController } from '../cse/cse.controller';
import { CseService } from '../cse/cse.service';

@Module({
  imports: [],
  controllers: [AppController, CseController],
  providers: [AppService, CseService],
})
export class AppModule {}
