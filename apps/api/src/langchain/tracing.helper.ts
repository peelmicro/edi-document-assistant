import type { RunnableConfig } from '@langchain/core/runnables';
import type { ProviderCode } from './providers.factory';

export type AnalysisMode = 'chain' | 'stream' | 'graph';

export interface AnalysisTracingContext {
  documentCode: string;
  filename: string;
  format: string;
  providerCode: ProviderCode;
  model: string;
  mode: AnalysisMode;
}

/**
 * Builds a `RunnableConfig` whose `tags` and `metadata` enrich every span
 * the LLM call (or graph) produces in LangSmith.
 *
 * Tags are short and filterable from the dashboard sidebar — pick "filter
 * by tag" in LangSmith and you can isolate every run for a given provider,
 * mode, or document format with a single click.
 *
 * Metadata carries the structured business context that lives in our DB
 * but never made it into LangSmith before — document code, filename, etc.
 * Each trace becomes self-explanatory without having to cross-reference
 * the API logs.
 *
 * `runName` is a human-readable label that overrides the default
 * `RunnableSequence` / `LangGraph` heading at the top of each trace.
 */
export function buildTracingConfig(ctx: AnalysisTracingContext): RunnableConfig {
  return {
    runName: `analyze-${ctx.documentCode}-${ctx.mode}`,
    tags: [
      `mode:${ctx.mode}`,
      `format:${ctx.format}`,
      `provider:${ctx.providerCode}`,
      `model:${ctx.model}`,
    ],
    metadata: {
      documentCode: ctx.documentCode,
      filename: ctx.filename,
      format: ctx.format,
      providerCode: ctx.providerCode,
      model: ctx.model,
      mode: ctx.mode,
    },
  };
}
