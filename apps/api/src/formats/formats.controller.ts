import { Controller, Get } from '@nestjs/common';
import { FormatsService } from './formats.service';

@Controller('formats')
export class FormatsController {
  constructor(private readonly formatsService: FormatsService) {}

  @Get()
  findAll() {
    return this.formatsService.findAll();
  }
}
