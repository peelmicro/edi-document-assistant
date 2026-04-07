import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export type ProviderCode = 'anthropic' | 'openai' | 'google';

export interface CreateModelOptions {
  providerCode: ProviderCode;
  model: string;
  streaming?: boolean;
  temperature?: number;
}

/**
 * Builds a LangChain `BaseChatModel` for the requested provider.
 *
 * Adding a new provider = one extra `case` here + installing the matching
 * `@langchain/<provider>` package. The chain/graph code that consumes the
 * returned model does not need to change.
 */
@Injectable()
export class ProvidersFactory {
  private readonly logger = new Logger(ProvidersFactory.name);

  constructor(private readonly config: ConfigService) {}

  createModel(options: CreateModelOptions): BaseChatModel {
    const { providerCode, model, streaming = false, temperature = 0 } = options;

    switch (providerCode) {
      case 'anthropic': {
        const apiKey = this.requireApiKey('ANTHROPIC_API_KEY', providerCode);
        return new ChatAnthropic({
          model,
          apiKey,
          streaming,
          temperature,
        });
      }

      case 'openai': {
        const apiKey = this.requireApiKey('OPENAI_API_KEY', providerCode);
        return new ChatOpenAI({
          model,
          apiKey,
          streaming,
          temperature,
        });
      }

      case 'google': {
        const apiKey = this.requireApiKey('GOOGLE_API_KEY', providerCode);
        return new ChatGoogleGenerativeAI({
          model,
          apiKey,
          streaming,
          temperature,
        });
      }

      default: {
        const exhaustiveCheck: never = providerCode;
        throw new Error(`Unknown provider code: ${exhaustiveCheck}`);
      }
    }
  }

  private requireApiKey(envVar: string, providerCode: ProviderCode): string {
    const apiKey = this.config.get<string>(envVar);
    if (!apiKey) {
      this.logger.warn(`${envVar} is not set — calls to ${providerCode} will fail`);
      throw new Error(
        `Missing API key for provider "${providerCode}". Set ${envVar} in your .env file.`,
      );
    }
    return apiKey;
  }
}
