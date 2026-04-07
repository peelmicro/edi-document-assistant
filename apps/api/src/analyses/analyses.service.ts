import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { LangChainService } from '../langchain/langchain.service';
import type { ProviderCode } from '../langchain/providers.factory';

export interface AnalyzeDocumentRequest {
  documentCode: string;
  providerCode: ProviderCode;
  model: string;
}

@Injectable()
export class AnalysesService {
  private readonly logger = new Logger(AnalysesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly langchain: LangChainService,
  ) {}

  /**
   * End-to-end analysis of a stored document:
   *   1. Load the document row + its format from PostgreSQL
   *   2. Look up the AI provider row (so we can persist the FK)
   *   3. Validate the requested model is one of the provider's known models
   *   4. Stream the file from MinIO
   *   5. Run the LangChain chain via the requested provider
   *   6. Persist a `Process` (with the structured result + raw response) and
   *      link it to the document via an `Analysis`
   *
   * Failures are persisted as a `Process` with status="failed" so the UI
   * can later show why an analysis didn't complete.
   */
  async analyze(request: AnalyzeDocumentRequest) {
    const { documentCode, providerCode, model } = request;

    const document = await this.prisma.document.findUnique({
      where: { code: documentCode },
      include: { format: true },
    });
    if (!document) {
      throw new NotFoundException(`Document not found: ${documentCode}`);
    }

    const provider = await this.prisma.aiProvider.findUnique({
      where: { code: providerCode },
    });
    if (!provider) {
      throw new NotFoundException(`AI provider not found: ${providerCode}`);
    }

    const knownModels = (provider.models as string[]) ?? [];
    if (!knownModels.includes(model)) {
      throw new NotFoundException(
        `Model "${model}" is not registered for provider "${providerCode}". Known: ${knownModels.join(', ')}`,
      );
    }

    const fileBuffer = await this.storage.download(document.storagePath);
    const content = fileBuffer.toString('utf-8');

    const startedAt = new Date();
    try {
      const { analysis, rawResponse, finishedAt } = await this.langchain.analyzeDocument({
        providerCode,
        model,
        format: document.format.code,
        filename: document.filename,
        content,
      });

      // Persist as a Process + Analysis using the "checked" relation form
      const created = await this.prisma.analysis.create({
        data: {
          document: { connect: { id: document.id } },
          process: {
            create: {
              aiProvider: { connect: { id: provider.id } },
              fromTime: startedAt,
              toTime: finishedAt,
              status: 'completed',
              result: analysis as object,
              response: rawResponse,
            },
          },
        },
        include: {
          document: { select: { code: true, filename: true, storagePath: true } },
          process: { include: { aiProvider: { select: { code: true, name: true } } } },
        },
      });

      return created;
    } catch (error) {
      const failedAt = new Date();
      const message = (error as Error).message;
      this.logger.error(
        `Analysis failed for ${documentCode} via ${providerCode}/${model}: ${message}`,
      );

      // Persist the failure so the user can see what happened
      const failed = await this.prisma.analysis.create({
        data: {
          document: { connect: { id: document.id } },
          process: {
            create: {
              aiProvider: { connect: { id: provider.id } },
              fromTime: startedAt,
              toTime: failedAt,
              status: 'failed',
              errorMessage: message,
            },
          },
        },
        include: {
          document: { select: { code: true, filename: true, storagePath: true } },
          process: { include: { aiProvider: { select: { code: true, name: true } } } },
        },
      });

      return failed;
    }
  }

  async findAllForDocument(documentCode: string) {
    const document = await this.prisma.document.findUnique({
      where: { code: documentCode },
    });
    if (!document) {
      throw new NotFoundException(`Document not found: ${documentCode}`);
    }
    return this.prisma.analysis.findMany({
      where: { documentId: document.id },
      orderBy: { createdAt: 'desc' },
      include: {
        document: { select: { code: true, filename: true, storagePath: true } },
        process: { include: { aiProvider: { select: { code: true, name: true } } } },
      },
    });
  }
}
