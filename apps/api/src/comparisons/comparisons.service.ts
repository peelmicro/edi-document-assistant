import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { LangChainService } from '../langchain/langchain.service';
import { ProvidersFactory, type ProviderCode } from '../langchain/providers.factory';
import { comparePrompt } from '../langchain/prompts/compare.prompt';
import { comparisonParser } from '../langchain/parsers/comparison.parser';
import { buildTracingConfig } from '../langchain/tracing.helper';

export interface CrossDocumentRequest {
  type: 'cross_document';
  documentACode: string;
  documentBCode: string;
  providerCode: ProviderCode;
  model: string;
}

export interface CrossProviderRequest {
  type: 'cross_provider';
  documentCode: string;
  providerACode: ProviderCode;
  modelA: string;
  providerBCode: ProviderCode;
  modelB: string;
  /** The provider/model that runs the diff itself. */
  judgeProviderCode: ProviderCode;
  judgeModel: string;
}

export type ComparisonRequest = CrossDocumentRequest | CrossProviderRequest;

@Injectable()
export class ComparisonsService {
  private readonly logger = new Logger(ComparisonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly langchain: LangChainService,
    private readonly providersFactory: ProvidersFactory,
  ) {}

  async findAll() {
    return this.prisma.comparison.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        documentA: { select: { code: true, filename: true } },
        documentB: { select: { code: true, filename: true } },
        process: { include: { aiProvider: { select: { code: true, name: true } } } },
      },
    });
  }

  async create(request: ComparisonRequest) {
    if (request.type === 'cross_document') {
      return this.crossDocument(request);
    }
    return this.crossProvider(request);
  }

  /**
   * Cross-document comparison: pick two documents and ask one model to diff them.
   *
   * Loads both raw document bodies from MinIO, runs a single LLM call with
   * the compare prompt + parser, and persists the result as a Comparison
   * row whose `Process.result` is the structured diff.
   */
  private async crossDocument(req: CrossDocumentRequest) {
    const [docA, docB] = await Promise.all([
      this.prisma.document.findUnique({ where: { code: req.documentACode }, include: { format: true } }),
      this.prisma.document.findUnique({ where: { code: req.documentBCode }, include: { format: true } }),
    ]);
    if (!docA) throw new NotFoundException(`Document not found: ${req.documentACode}`);
    if (!docB) throw new NotFoundException(`Document not found: ${req.documentBCode}`);

    const provider = await this.requireProvider(req.providerCode, req.model);

    const [bufA, bufB] = await Promise.all([
      this.storage.download(docA.storagePath),
      this.storage.download(docB.storagePath),
    ]);
    const payloadA = bufA.toString('utf-8');
    const payloadB = bufB.toString('utf-8');

    const result = await this.runCompareCall({
      providerCode: req.providerCode,
      model: req.model,
      comparisonType: 'cross_document',
      labelA: `${docA.code} (${docA.filename})`,
      labelB: `${docB.code} (${docB.filename})`,
      payloadA,
      payloadB,
      tracingDocumentCode: `${docA.code}-vs-${docB.code}`,
      tracingFilename: `${docA.filename}+${docB.filename}`,
      tracingFormat: docA.format.code === docB.format.code ? docA.format.code : 'mixed',
    });

    return this.prisma.comparison.create({
      data: {
        documentA: { connect: { id: docA.id } },
        documentB: { connect: { id: docB.id } },
        process: {
          create: {
            aiProvider: { connect: { id: provider.id } },
            fromTime: result.startedAt,
            toTime: result.finishedAt,
            status: 'completed',
            result: result.parsed as object,
            response: result.raw,
          },
        },
      },
      include: {
        documentA: { select: { code: true, filename: true } },
        documentB: { select: { code: true, filename: true } },
        process: { include: { aiProvider: { select: { code: true, name: true } } } },
      },
    });
  }

  /**
   * Cross-provider comparison: analyse the same document with two providers,
   * then ask a third "judge" model to diff the two analyses.
   *
   * The two underlying analyses are run via the existing `LangChainService`
   * so they're persisted as regular Analysis rows on the document — they
   * appear in the document detail page like any other analysis.
   */
  private async crossProvider(req: CrossProviderRequest) {
    const document = await this.prisma.document.findUnique({
      where: { code: req.documentCode },
      include: { format: true },
    });
    if (!document) throw new NotFoundException(`Document not found: ${req.documentCode}`);

    await this.requireProvider(req.providerACode, req.modelA);
    await this.requireProvider(req.providerBCode, req.modelB);
    const judge = await this.requireProvider(req.judgeProviderCode, req.judgeModel);

    const fileBuffer = await this.storage.download(document.storagePath);
    const content = fileBuffer.toString('utf-8');

    // Run the two underlying analyses in parallel
    const [resultA, resultB] = await Promise.all([
      this.langchain.analyzeDocument(
        {
          providerCode: req.providerACode,
          model: req.modelA,
          format: document.format.code,
          filename: document.filename,
          content,
        },
        {
          documentCode: document.code,
          filename: document.filename,
          format: document.format.code,
          providerCode: req.providerACode,
          model: req.modelA,
          mode: 'chain',
        },
      ),
      this.langchain.analyzeDocument(
        {
          providerCode: req.providerBCode,
          model: req.modelB,
          format: document.format.code,
          filename: document.filename,
          content,
        },
        {
          documentCode: document.code,
          filename: document.filename,
          format: document.format.code,
          providerCode: req.providerBCode,
          model: req.modelB,
          mode: 'chain',
        },
      ),
    ]);

    // Run the diff itself via the judge model
    const compareResult = await this.runCompareCall({
      providerCode: req.judgeProviderCode,
      model: req.judgeModel,
      comparisonType: 'cross_provider',
      labelA: `${req.providerACode}/${req.modelA}`,
      labelB: `${req.providerBCode}/${req.modelB}`,
      payloadA: JSON.stringify(resultA.analysis, null, 2),
      payloadB: JSON.stringify(resultB.analysis, null, 2),
      tracingDocumentCode: document.code,
      tracingFilename: document.filename,
      tracingFormat: document.format.code,
    });

    return this.prisma.comparison.create({
      data: {
        documentA: { connect: { id: document.id } },
        documentB: { connect: { id: document.id } },
        process: {
          create: {
            aiProvider: { connect: { id: judge.id } },
            fromTime: compareResult.startedAt,
            toTime: compareResult.finishedAt,
            status: 'completed',
            result: compareResult.parsed as object,
            response: compareResult.raw,
          },
        },
      },
      include: {
        documentA: { select: { code: true, filename: true } },
        documentB: { select: { code: true, filename: true } },
        process: { include: { aiProvider: { select: { code: true, name: true } } } },
      },
    });
  }

  // ----- helpers -----

  private async requireProvider(providerCode: ProviderCode, model: string) {
    const provider = await this.prisma.aiProvider.findUnique({ where: { code: providerCode } });
    if (!provider) throw new NotFoundException(`AI provider not found: ${providerCode}`);
    const knownModels = (provider.models as string[]) ?? [];
    if (!knownModels.includes(model)) {
      throw new BadRequestException(
        `Model "${model}" is not registered for provider "${providerCode}". Known: ${knownModels.join(', ')}`,
      );
    }
    return provider;
  }

  /**
   * Single LLM call wrapped around the compare prompt and structured parser.
   * Returns the parsed JSON, the raw text, and start/end times so the caller
   * can persist a Process row.
   */
  private async runCompareCall(args: {
    providerCode: ProviderCode;
    model: string;
    comparisonType: 'cross_document' | 'cross_provider';
    labelA: string;
    labelB: string;
    payloadA: string;
    payloadB: string;
    tracingDocumentCode: string;
    tracingFilename: string;
    tracingFormat: string;
  }) {
    const llm = this.providersFactory.createModel({
      providerCode: args.providerCode,
      model: args.model,
      streaming: false,
    });

    const messages = await comparePrompt.formatMessages({
      comparisonType: args.comparisonType,
      labelA: args.labelA,
      labelB: args.labelB,
      payloadA: args.payloadA,
      payloadB: args.payloadB,
      format_instructions: comparisonParser.getFormatInstructions(),
    });

    const tracingConfig = buildTracingConfig({
      documentCode: args.tracingDocumentCode,
      filename: args.tracingFilename,
      format: args.tracingFormat,
      providerCode: args.providerCode,
      model: args.model,
      mode: 'chain',
    });

    const startedAt = new Date();
    const response = await llm.invoke(messages, tracingConfig);
    const finishedAt = new Date();

    const raw = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
    const parsed = await comparisonParser.parse(raw);

    this.logger.log(
      `Comparison (${args.comparisonType}) by ${args.providerCode}/${args.model} in ${
        finishedAt.getTime() - startedAt.getTime()
      }ms`,
    );

    return { parsed, raw, startedAt, finishedAt };
  }
}
