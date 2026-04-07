import { Injectable, Logger } from '@nestjs/common';
import { ProvidersFactory, type ProviderCode } from '../langchain/providers.factory';
import { buildDocumentAgent, type DocumentAgent } from './document-agent';
import type { DocumentAnalysis } from '../langchain/parsers/document-analysis.parser';
import type { DocumentClassification } from './state';
import {
  buildTracingConfig,
  type AnalysisTracingContext,
} from '../langchain/tracing.helper';

export interface AnalyzeWithGraphInput {
  providerCode: ProviderCode;
  model: string;
  format: string;
  filename: string;
  content: string;
}

export interface AnalyzeWithGraphResult {
  analysis: DocumentAnalysis;
  classification: DocumentClassification;
  classifyRawResponse: string;
  explainRawResponse: string;
  contentLength: number;
  segmentCount: number;
  startedAt: Date;
  finishedAt: Date;
}

/**
 * Runs the LangGraph document analysis agent.
 *
 * The compiled graph is built once at module instantiation and reused
 * across requests — it's stateless. Each `analyze()` call passes the
 * per-request inputs (including the LLM built by `ProvidersFactory`) as
 * the initial state.
 */
@Injectable()
export class LangGraphService {
  private readonly logger = new Logger(LangGraphService.name);
  private readonly agent: DocumentAgent;

  constructor(private readonly providersFactory: ProvidersFactory) {
    this.agent = buildDocumentAgent();
  }

  async analyze(
    input: AnalyzeWithGraphInput,
    tracingContext?: AnalysisTracingContext,
  ): Promise<AnalyzeWithGraphResult> {
    const { providerCode, model, format, filename, content } = input;

    const llm = this.providersFactory.createModel({
      providerCode,
      model,
      streaming: false,
    });

    const config = tracingContext ? buildTracingConfig(tracingContext) : undefined;

    const startedAt = new Date();
    try {
      const finalState = await this.agent.invoke(
        {
          format,
          filename,
          content,
          llm,
        },
        config,
      );
      const finishedAt = new Date();

      this.logger.log(
        `Graph analysis for ${filename} via ${providerCode}/${model} ` +
          `classified as "${finalState.classification}" in ${
            finishedAt.getTime() - startedAt.getTime()
          }ms`,
      );

      return {
        analysis: finalState.analysis,
        classification: finalState.classification,
        classifyRawResponse: finalState.classifyRawResponse,
        explainRawResponse: finalState.explainRawResponse,
        contentLength: finalState.contentLength,
        segmentCount: finalState.segmentCount,
        startedAt,
        finishedAt,
      };
    } catch (error) {
      this.logger.error(
        `Graph analysis failed for ${filename} via ${providerCode}/${model}: ${
          (error as Error).message
        }`,
      );
      throw error;
    }
  }
}
