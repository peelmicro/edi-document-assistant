import { Annotation } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { DocumentAnalysis } from '../langchain/parsers/document-analysis.parser';

/**
 * Document classifications the graph routes on.
 *
 * "other" is the catch-all branch — when the classifier is not confident
 * the document fits one of the known shapes, it routes to a generic explain
 * node that does best-effort extraction with the format-agnostic prompt
 * from Phase 4.
 */
export type DocumentClassification =
  | 'purchase_order'
  | 'invoice'
  | 'despatch_advice'
  | 'product_catalog'
  | 'other';

/**
 * Shared state for the document analysis agent.
 *
 * Each node reads what it needs, returns a partial update, and LangGraph
 * merges the update into the running state before invoking the next node.
 *
 * `Annotation.Root({ ... })` is LangGraph v1's way of declaring the state
 * shape and giving each field a default reducer (here all defaults are
 * "replace with the new value").
 */
export const DocumentAgentState = Annotation.Root({
  // ---- inputs (set once at the start) ----
  format: Annotation<string>,
  filename: Annotation<string>,
  content: Annotation<string>,
  llm: Annotation<BaseChatModel>,

  // ---- populated by PARSE node ----
  contentLength: Annotation<number>,
  segmentCount: Annotation<number>,

  // ---- populated by CLASSIFY node ----
  classification: Annotation<DocumentClassification>,
  classifyRawResponse: Annotation<string>,

  // ---- populated by EXPLAIN node ----
  analysis: Annotation<DocumentAnalysis>,
  explainRawResponse: Annotation<string>,

  // ---- populated by SUGGEST node ----
  suggestedActions: Annotation<string[]>,
});

export type DocumentAgentStateType = typeof DocumentAgentState.State;
