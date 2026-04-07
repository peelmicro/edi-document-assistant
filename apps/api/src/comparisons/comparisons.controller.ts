import { Body, Controller, Get, Post } from '@nestjs/common';
import { ComparisonsService, type ComparisonRequest } from './comparisons.service';

@Controller('comparisons')
export class ComparisonsController {
  constructor(private readonly comparisonsService: ComparisonsService) {}

  @Get()
  findAll() {
    return this.comparisonsService.findAll();
  }

  @Post()
  create(@Body() body: ComparisonRequest) {
    return this.comparisonsService.create(body);
  }
}
