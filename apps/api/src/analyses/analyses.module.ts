import { Module } from '@nestjs/common';
import { AnalysesService } from './analyses.service';
import { AnalysesController } from './analyses.controller';

@Module({
  providers: [AnalysesService],
  controllers: [AnalysesController],
  exports: [AnalysesService],
})
export class AnalysesModule {}
