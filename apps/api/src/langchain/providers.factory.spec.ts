import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ProvidersFactory } from './providers.factory';

// Stub out the provider SDKs so tests never make real network calls
vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn().mockImplementation((opts) => ({ _provider: 'anthropic', ...opts })),
}));
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn().mockImplementation((opts) => ({ _provider: 'openai', ...opts })),
}));
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: vi.fn().mockImplementation((opts) => ({ _provider: 'google', ...opts })),
}));

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const defaults: Record<string, string> = {
    ANTHROPIC_API_KEY: 'sk-ant-test',
    OPENAI_API_KEY: 'sk-oai-test',
    GOOGLE_API_KEY: 'goog-test',
    ...overrides,
  };
  return { get: (key: string) => defaults[key] } as unknown as ConfigService;
}

describe('ProvidersFactory', () => {
  let factory: ProvidersFactory;

  beforeEach(() => {
    factory = new ProvidersFactory(makeConfig());
  });

  it('creates an Anthropic model with the supplied options', () => {
    const model = factory.createModel({
      providerCode: 'anthropic',
      model: 'claude-haiku-4-5',
    });
    expect((model as unknown as Record<string, unknown>)['_provider']).toBe('anthropic');
    expect((model as unknown as Record<string, unknown>)['model']).toBe('claude-haiku-4-5');
  });

  it('creates an OpenAI model', () => {
    const model = factory.createModel({ providerCode: 'openai', model: 'gpt-4o-mini' });
    expect((model as unknown as Record<string, unknown>)['_provider']).toBe('openai');
  });

  it('creates a Google model', () => {
    const model = factory.createModel({
      providerCode: 'google',
      model: 'gemini-2.0-flash',
    });
    expect((model as unknown as Record<string, unknown>)['_provider']).toBe('google');
  });

  it('passes streaming flag to the underlying constructor', () => {
    const model = factory.createModel({
      providerCode: 'anthropic',
      model: 'claude-haiku-4-5',
      streaming: true,
    });
    expect((model as unknown as Record<string, unknown>)['streaming']).toBe(true);
  });

  it('throws when the API key env var is missing', () => {
    const noKeyFactory = new ProvidersFactory(makeConfig({ ANTHROPIC_API_KEY: '' }));
    expect(() =>
      noKeyFactory.createModel({ providerCode: 'anthropic', model: 'claude-haiku-4-5' }),
    ).toThrow('Missing API key');
  });

  it('throws for an unknown provider code (compile-time exhaustive check)', () => {
    expect(() =>
      factory.createModel({
        providerCode: 'unknown' as 'anthropic',
        model: 'x',
      }),
    ).toThrow('Unknown provider code');
  });
});
