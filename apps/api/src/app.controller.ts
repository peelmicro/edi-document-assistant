import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'edi-document-assistant-api',
      timestamp: new Date().toISOString(),
    };
  }
}
