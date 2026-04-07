import { Controller, Post } from '@nestjs/common';
import { SeedService } from './seed.service';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post()
  async seedAll() {
    return this.seedService.seedAll();
  }

  @Post('ai-providers')
  async seedAiProviders() {
    return this.seedService.seedAiProviders();
  }

  @Post('formats')
  async seedFormats() {
    return this.seedService.seedFormats();
  }

  @Post('documents')
  async seedDocuments() {
    return this.seedService.seedDocuments();
  }

  @Post('analyses')
  async seedAnalyses() {
    return this.seedService.seedAnalyses();
  }

  @Post('comparisons')
  async seedComparisons() {
    return this.seedService.seedComparisons();
  }
}
