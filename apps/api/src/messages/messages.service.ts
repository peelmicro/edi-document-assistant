import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ProvidersFactory, type ProviderCode } from '../langchain/providers.factory';
import { chatPrompt } from '../langchain/prompts/chat.prompt';
import { buildTracingConfig } from '../langchain/tracing.helper';

export interface AskQuestionRequest {
  documentCode: string;
  parentProcessId: string;
  providerCode: ProviderCode;
  model: string;
  question: string;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly providersFactory: ProvidersFactory,
  ) {}

  /**
   * Returns the message thread for a (document, parentProcess) pair.
   *
   * Each message includes its `Process` (so callers see role + cost +
   * timing + raw response in one shot) and the parent process is the
   * original analysis the user is having a conversation about.
   */
  async findThread(documentCode: string, parentProcessId: string) {
    const document = await this.prisma.document.findUnique({ where: { code: documentCode } });
    if (!document) {
      throw new NotFoundException(`Document not found: ${documentCode}`);
    }
    return this.prisma.message.findMany({
      where: { parentProcessId },
      orderBy: { createdAt: 'asc' },
      include: {
        process: { include: { aiProvider: { select: { code: true, name: true } } } },
      },
    });
  }

  /**
   * Asks a follow-up question about a previously analysed document.
   *
   * 1. Loads the document, validates the parent analysis exists for it
   * 2. Loads the document content from MinIO
   * 3. Loads the prior chat history for this thread
   * 4. Sends [system+context, history, question] to the chosen LLM
   * 5. Persists BOTH the user message and the assistant reply as Message
   *    rows, each with their own Process row (the user's Process is a
   *    placeholder with zero cost)
   * 6. Returns the assistant reply
   */
  async ask(request: AskQuestionRequest) {
    const { documentCode, parentProcessId, providerCode, model, question } = request;

    if (!question || question.trim().length === 0) {
      throw new BadRequestException('Question is required');
    }

    const document = await this.prisma.document.findUnique({
      where: { code: documentCode },
      include: { format: true },
    });
    if (!document) {
      throw new NotFoundException(`Document not found: ${documentCode}`);
    }

    // Validate the parent process belongs to an analysis of this document
    const parentAnalysis = await this.prisma.analysis.findFirst({
      where: { documentId: document.id, processId: parentProcessId },
      include: { process: true },
    });
    if (!parentAnalysis) {
      throw new NotFoundException(
        `Parent analysis ${parentProcessId} not found for document ${documentCode}`,
      );
    }

    const provider = await this.prisma.aiProvider.findUnique({ where: { code: providerCode } });
    if (!provider) {
      throw new NotFoundException(`AI provider not found: ${providerCode}`);
    }
    const knownModels = (provider.models as string[]) ?? [];
    if (!knownModels.includes(model)) {
      throw new BadRequestException(
        `Model "${model}" is not registered for provider "${providerCode}". Known: ${knownModels.join(', ')}`,
      );
    }

    // Load chat history for this thread (chronological)
    const history = await this.prisma.message.findMany({
      where: { parentProcessId },
      orderBy: { createdAt: 'asc' },
      include: { process: { select: { response: true } } },
    });
    const langchainHistory: BaseMessage[] = history.flatMap((m): BaseMessage[] => {
      const text = m.process.response ?? '';
      if (text.length === 0) return [];
      return m.role === 'user' ? [new HumanMessage(text)] : [new AIMessage(text)];
    });

    // Load the document content from MinIO
    const fileBuffer = await this.storage.download(document.storagePath);
    const content = fileBuffer.toString('utf-8');

    // Build the LLM and the prompt messages
    const llm = this.providersFactory.createModel({ providerCode, model, streaming: false });
    const messages = await chatPrompt.formatMessages({
      format: document.format.code,
      filename: document.filename,
      content,
      previousAnalysis: JSON.stringify(parentAnalysis.process.result ?? {}, null, 2),
      history: langchainHistory,
      question,
    });

    const tracingConfig = buildTracingConfig({
      documentCode: document.code,
      filename: document.filename,
      format: document.format.code,
      providerCode,
      model,
      mode: 'chain',
    });

    const startedAt = new Date();
    let answerText = '';
    let status: 'completed' | 'failed' = 'completed';
    let errorMessage: string | undefined;

    try {
      const response = await llm.invoke(messages, tracingConfig);
      answerText = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    } catch (error) {
      status = 'failed';
      errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Chat failed for ${documentCode} via ${providerCode}/${model}: ${errorMessage}`,
      );
    }
    const finishedAt = new Date();

    // Persist BOTH messages (user + assistant) so the thread is complete.
    // Done in a single Prisma transaction so a failure mid-write doesn't
    // leave the thread in a half-saved state.
    const [, assistantMessage] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          role: 'user',
          parentProcess: { connect: { id: parentProcessId } },
          process: {
            create: {
              aiProvider: { connect: { id: provider.id } },
              fromTime: startedAt,
              toTime: startedAt,
              status: 'completed',
              response: question,
            },
          },
        },
      }),
      this.prisma.message.create({
        data: {
          role: 'assistant',
          parentProcess: { connect: { id: parentProcessId } },
          process: {
            create: {
              aiProvider: { connect: { id: provider.id } },
              fromTime: startedAt,
              toTime: finishedAt,
              status,
              response: status === 'completed' ? answerText : null,
              errorMessage,
            },
          },
        },
        include: {
          process: { include: { aiProvider: { select: { code: true, name: true } } } },
        },
      }),
    ]);

    return assistantMessage;
  }
}
