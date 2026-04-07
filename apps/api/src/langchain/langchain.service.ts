import { Injectable, Logger } from '@nestjs/common';
import { RunnableSequence } from '@langchain/core/runnables';
import { ProvidersFactory, type ProviderCode } from './providers.factory';
import { analyzeDocumentPrompt } from './prompts/analyze-document.prompt';
import {
  documentAnalysisParser,
  type DocumentAnalysis,
} from './parsers/document-analysis.parser';

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

  async analyzeDocument(input: AnalyzeDocumentInput): Promise<AnalyzeDocumentResult> {
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

    const startedAt = new Date();
    try {
      const analysis = await chain.invoke({
        format,
        filename,
        content,
        format_instructions: formatInstructions,
      });
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
}
