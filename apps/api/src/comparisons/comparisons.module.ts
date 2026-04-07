import { Module } from '@nestjs/common';
import { ComparisonsService } from './comparisons.service';
import { ComparisonsController } from './comparisons.controller';

@Module({
  providers: [ComparisonsService],
  controllers: [ComparisonsController],
  exports: [ComparisonsService],
})
export class ComparisonsModule {}
