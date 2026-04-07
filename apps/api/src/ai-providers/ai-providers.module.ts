import { Module } from '@nestjs/common';
import { AiProvidersService } from './ai-providers.service';
import { AiProvidersController } from './ai-providers.controller';

@Module({
  providers: [AiProvidersService],
  controllers: [AiProvidersController],
  exports: [AiProvidersService],
})
export class AiProvidersModule {}
