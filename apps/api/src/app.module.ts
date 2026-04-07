import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { StorageModule } from './storage/storage.module';
import { LangChainModule } from './langchain/langchain.module';
import { LangGraphModule } from './langgraph/langgraph.module';
import { DocumentsModule } from './documents/documents.module';
import { AnalysesModule } from './analyses/analyses.module';
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
    SeedModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
