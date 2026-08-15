import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getData() {
    return { message: 'CSE stock analysis API' };
  }

  @Get('items')
  getItems() {
    return this.appService.getItems();
  }
}
