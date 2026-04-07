import { Injectable, Logger } from '@nestjs/common';
import { RunnableSequence } from '@langchain/core/runnables';
import { ProvidersFactory, type ProviderCode } from './providers.factory';
import { analyzeDocumentPrompt } from './prompts/analyze-document.prompt';
import {
  documentAnalysisParser,
  type DocumentAnalysis,
} from './parsers/document-analysis.parser';
import { buildTracingConfig, type AnalysisTracingContext } from './tracing.helper';

export type StreamEvent =
  | { type: 'token'; token: string }
  | {
      type: 'done';
      analysis: DocumentAnalysis;
      rawResponse: string;
      startedAt: Date;
      finishedAt: Date;
    }
  | { type: 'error'; message: string };

export interface AnalyzeDocumentInput {
  providerCode: ProviderCode;
  model: string;
  format: string;
  filename: string;
  content: string;
}

export interface AnalyzeDocumentResult {
  analysis: DocumentAnalysis;
  rawResponse: string;
  startedAt: Date;
  finishedAt: Date;
}

/**
 * Core LangChain.js orchestration: builds a provider-agnostic chain
 * (prompt → model → parser) and runs it against a single document.
 *
 * The same chain works with Anthropic, OpenAI, or Google because the model
 * is built by `ProvidersFactory` and consumed via the abstract `BaseChatModel`
 * interface.
 */
@Injectable()
export class LangChainService {
  private readonly logger = new Logger(LangChainService.name);

  constructor(private readonly providersFactory: ProvidersFactory) {}

  async analyzeDocument(
    input: AnalyzeDocumentInput,
    tracingContext?: AnalysisTracingContext,
  ): Promise<AnalyzeDocumentResult> {
    const { providerCode, model, format, filename, content } = input;

    const llm = this.providersFactory.createModel({
      providerCode,
      model,
      streaming: false,
    });

    // Capture the raw model output for persistence/debugging before it
    // gets parsed into structured JSON
    let rawResponse = '';

    const chain = RunnableSequence.from([
      analyzeDocumentPrompt,
      llm,
      (message) => {
        rawResponse = typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content);
        return rawResponse;
      },
      documentAnalysisParser,
    ]);

    const formatInstructions = documentAnalysisParser.getFormatInstructions();
    const config = tracingContext ? buildTracingConfig(tracingContext) : undefined;

    const startedAt = new Date();
    try {
      const analysis = await chain.invoke(
        {
          format,
          filename,
          content,
          format_instructions: formatInstructions,
        },
        config,
      );
      const finishedAt = new Date();

      this.logger.log(
        `Analyzed ${filename} with ${providerCode}/${model} in ${
          finishedAt.getTime() - startedAt.getTime()
        }ms`,
      );

      return { analysis, rawResponse, startedAt, finishedAt };
    } catch (error) {
      this.logger.error(
        `Analysis failed for ${filename} with ${providerCode}/${model}: ${
          (error as Error).message
        }`,
      );
      throw error;
    }
  }

  /**
   * Streaming variant of `analyzeDocument`.
   *
   * Yields:
   *   - one `{ type: 'token', token }` per chunk emitted by the LLM
   *   - one final `{ type: 'done', analysis, rawResponse, ... }` once the full
   *     output has been collected and parsed by the structured parser
   *   - or one `{ type: 'error', message }` if anything fails
   *
   * The same prompt and parser as `analyzeDocument` are reused so the two
   * code paths cannot drift apart. The model is built with `streaming: true`
   * so chunks are pushed as the LLM produces them.
   */
  async *streamAnalyzeDocument(
    input: AnalyzeDocumentInput,
    abortSignal?: AbortSignal,
    tracingContext?: AnalysisTracingContext,
  ): AsyncGenerator<StreamEvent> {
    const { providerCode, model, format, filename, content } = input;

    const llm = this.providersFactory.createModel({
      providerCode,
      model,
      streaming: true,
    });

    const formatInstructions = documentAnalysisParser.getFormatInstructions();
    const startedAt = new Date();

    try {
      const promptValue = await analyzeDocumentPrompt.formatMessages({
        format,
        filename,
        content,
        format_instructions: formatInstructions,
      });

      let rawResponse = '';
      const tracingConfig = tracingContext ? buildTracingConfig(tracingContext) : {};
      const stream = await llm.stream(promptValue, {
        ...tracingConfig,
        signal: abortSignal,
      });

      for await (const chunk of stream) {
        const token =
          typeof chunk.content === 'string'
            ? chunk.content
            : JSON.stringify(chunk.content);
        if (token.length === 0) continue;
        rawResponse += token;
        yield { type: 'token', token };
      }

      // Parse the full collected response into the structured shape
      const analysis = await documentAnalysisParser.parse(rawResponse);
      const finishedAt = new Date();

      this.logger.log(
        `Streamed analysis for ${filename} with ${providerCode}/${model} in ${
          finishedAt.getTime() - startedAt.getTime()
        }ms (${rawResponse.length} chars)`,
      );

      yield { type: 'done', analysis, rawResponse, startedAt, finishedAt };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(
        `Streaming analysis failed for ${filename} with ${providerCode}/${model}: ${message}`,
      );
      yield { type: 'error', message };
    }
  }
}
