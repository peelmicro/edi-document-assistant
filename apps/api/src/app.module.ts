import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { HttpLoggerMiddleware } from './common/http-logger.middleware';
import { StorageModule } from './storage/storage.module';
import { LangChainModule } from './langchain/langchain.module';
import { LangGraphModule } from './langgraph/langgraph.module';
import { DocumentsModule } from './documents/documents.module';
import { AnalysesModule } from './analyses/analyses.module';
import { MessagesModule } from './messages/messages.module';
import { ComparisonsModule } from './comparisons/comparisons.module';
import { FormatsModule } from './formats/formats.module';
import { AiProvidersModule } from './ai-providers/ai-providers.module';
import { SeedModule } from './seed/seed.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    PrismaModule,
    CommonModule,
    StorageModule,
    LangChainModule,
    LangGraphModule,
    DocumentsModule,
    AnalysesModule,
    MessagesModule,
    ComparisonsModule,
    FormatsModule,
    AiProvidersModule,
    SeedModule,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpLoggerMiddleware).forRoutes('*');
  }
}
