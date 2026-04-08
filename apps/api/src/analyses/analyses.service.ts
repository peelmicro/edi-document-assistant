import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { LangChainService, type StreamEvent } from '../langchain/langchain.service';
import { LangGraphService } from '../langgraph/langgraph.service';
import type { ProviderCode } from '../langchain/providers.factory';
import { decodeDocumentBuffer } from '../common/document-encoding';

export type AnalysisMode = 'chain' | 'graph';

export interface AnalyzeDocumentRequest {
  documentCode: string;
  providerCode: ProviderCode;
  model: string;
  mode?: AnalysisMode;
}

/**
 * Higher-level event the SSE controller forwards to the client.
 *
 * Adds a `started` event up-front (so the UI can render a header before the
 * first token arrives) and an `analysis-saved` event after the DB write so
 * the UI can navigate to the persisted analysis row.
 */
export type AnalysisStreamEvent =
  | { type: 'started'; documentCode: string; providerCode: ProviderCode; model: string }
  | { type: 'token'; token: string }
  | { type: 'analysis-saved'; analysisId: string; processId: string }
  | { type: 'error'; message: string };

@Injectable()
export class AnalysesService {
  private readonly logger = new Logger(AnalysesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly langchain: LangChainService,
    private readonly langgraph: LangGraphService,
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
    const { documentCode, providerCode, model, mode = 'chain' } = request;

    this.logger.log(
      `Analysis: started for ${documentCode} via ${providerCode}/${model} mode=${mode}`,
    );

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
    const content = decodeDocumentBuffer(fileBuffer, document.format.code);

    const startedAt = new Date();
    try {
      // Both modes return the same { analysis, rawResponse, finishedAt }
      // shape so the persistence logic below is mode-agnostic. The graph
      // mode adds extra fields (classification, contentLength, etc.) which
      // we fold into the persisted `result` JSON for traceability.
      let analysis: object;
      let rawResponse: string;
      let finishedAt: Date;

      const tracingContext = {
        documentCode: document.code,
        filename: document.filename,
        format: document.format.code,
        providerCode,
        model,
        mode: mode as 'chain' | 'graph',
      };

      if (mode === 'graph') {
        const graphResult = await this.langgraph.analyze(
          {
            providerCode,
            model,
            format: document.format.code,
            filename: document.filename,
            content,
          },
          tracingContext,
        );
        analysis = {
          ...graphResult.analysis,
          _graph: {
            mode: 'graph',
            classification: graphResult.classification,
            contentLength: graphResult.contentLength,
            segmentCount: graphResult.segmentCount,
          },
        };
        rawResponse = graphResult.explainRawResponse;
        finishedAt = graphResult.finishedAt;
      } else {
        const chainResult = await this.langchain.analyzeDocument(
          {
            providerCode,
            model,
            format: document.format.code,
            filename: document.filename,
            content,
          },
          tracingContext,
        );
        analysis = chainResult.analysis;
        rawResponse = chainResult.rawResponse;
        finishedAt = chainResult.finishedAt;
      }

      // Persist as a Process + Analysis using the "checked" relation form
      const created = await this.prisma.analysis.create({
        data: {
          document: { connect: { id: document.id } },
          process: {
            create: {
              aiProvider: { connect: { id: provider.id } },
              model,
              mode,
              fromTime: startedAt,
              toTime: finishedAt,
              status: 'completed',
              result: analysis,
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
              model,
              mode,
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

  /**
   * Streaming variant of `analyze`.
   *
   * Yields `AnalysisStreamEvent`s the SSE controller forwards to the client:
   *   1. `started` once we've validated the inputs and loaded the document
   *   2. one `token` per LLM chunk
   *   3. `analysis-saved` after the parsed result has been persisted as a
   *      `Process` + `Analysis` row
   *   4. `error` if anything fails (also persisted as a failed Process so the
   *      UI can later show the cause)
   *
   * `abortSignal` is forwarded to LangChain so closing the SSE connection
   * cancels the in-flight LLM call instead of burning tokens.
   */
  async *streamAnalyze(
    request: AnalyzeDocumentRequest,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<AnalysisStreamEvent> {
    const { documentCode, providerCode, model } = request;

    const document = await this.prisma.document.findUnique({
      where: { code: documentCode },
      include: { format: true },
    });
    if (!document) {
      yield { type: 'error', message: `Document not found: ${documentCode}` };
      return;
    }

    const provider = await this.prisma.aiProvider.findUnique({
      where: { code: providerCode },
    });
    if (!provider) {
      yield { type: 'error', message: `AI provider not found: ${providerCode}` };
      return;
    }

    const knownModels = (provider.models as string[]) ?? [];
    if (!knownModels.includes(model)) {
      yield {
        type: 'error',
        message: `Model "${model}" is not registered for provider "${providerCode}". Known: ${knownModels.join(', ')}`,
      };
      return;
    }

    this.logger.log(
      `Stream: started for ${documentCode} via ${providerCode}/${model}`,
    );

    yield { type: 'started', documentCode, providerCode, model };

    const fileBuffer = await this.storage.download(document.storagePath);
    const content = decodeDocumentBuffer(fileBuffer, document.format.code);

    let finalEvent: StreamEvent | null = null;

    try {
      for await (const event of this.langchain.streamAnalyzeDocument(
        {
          providerCode,
          model,
          format: document.format.code,
          filename: document.filename,
          content,
        },
        abortSignal,
        {
          documentCode: document.code,
          filename: document.filename,
          format: document.format.code,
          providerCode,
          model,
          mode: 'stream',
        },
      )) {
        if (event.type === 'token') {
          yield { type: 'token', token: event.token };
        } else {
          finalEvent = event;
        }
      }
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(
        `Streaming analysis failed for ${documentCode} via ${providerCode}/${model}: ${message}`,
      );
      finalEvent = { type: 'error', message };
    }

    if (!finalEvent) {
      yield { type: 'error', message: 'Stream ended without a final event' };
      return;
    }

    if (finalEvent.type === 'error') {
      // Persist the failure so the user can see what happened later
      const failedAt = new Date();
      const failed = await this.prisma.analysis.create({
        data: {
          document: { connect: { id: document.id } },
          process: {
            create: {
              aiProvider: { connect: { id: provider.id } },
              model,
              mode: 'stream',
              fromTime: failedAt,
              toTime: failedAt,
              status: 'failed',
              errorMessage: finalEvent.message,
            },
          },
        },
      });
      yield { type: 'analysis-saved', analysisId: failed.id, processId: failed.processId };
      yield { type: 'error', message: finalEvent.message };
      return;
    }

    // finalEvent.type === 'done' — persist the successful run
    const created = await this.prisma.analysis.create({
      data: {
        document: { connect: { id: document.id } },
        process: {
          create: {
            aiProvider: { connect: { id: provider.id } },
            model,
            mode: 'stream',
            fromTime: finalEvent.startedAt,
            toTime: finalEvent.finishedAt,
            status: 'completed',
            result: finalEvent.analysis as object,
            response: finalEvent.rawResponse,
          },
        },
      },
    });

    yield { type: 'analysis-saved', analysisId: created.id, processId: created.processId };
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
