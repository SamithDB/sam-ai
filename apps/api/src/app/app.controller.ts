import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getData() {
    return { message: 'CSE stock analysis API' };
  }
}
