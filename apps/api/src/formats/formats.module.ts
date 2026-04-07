import { Module } from '@nestjs/common';
import { FormatsService } from './formats.service';
import { FormatsController } from './formats.controller';

@Module({
  providers: [FormatsService],
  controllers: [FormatsController],
  exports: [FormatsService],
})
export class FormatsModule {}
