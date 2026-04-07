import { Global, Module } from '@nestjs/common';
import { LangChainService } from './langchain.service';
import { ProvidersFactory } from './providers.factory';

@Global()
@Module({
  providers: [ProvidersFactory, LangChainService],
  exports: [LangChainService, ProvidersFactory],
})
export class LangChainModule {}
