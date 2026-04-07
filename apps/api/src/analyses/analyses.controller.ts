import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AnalysesService } from './analyses.service';
import type { ProviderCode } from '../langchain/providers.factory';

interface AnalyzeBody {
  providerCode: ProviderCode;
  model: string;
}

@Controller('documents/:code/analyses')
export class AnalysesController {
  constructor(private readonly analysesService: AnalysesService) {}

  @Get()
  async list(@Param('code') code: string) {
    return this.analysesService.findAllForDocument(code);
  }

  @Post()
  async analyze(@Param('code') code: string, @Body() body: AnalyzeBody) {
    return this.analysesService.analyze({
      documentCode: code,
      providerCode: body.providerCode,
      model: body.model,
    });
  }
}
