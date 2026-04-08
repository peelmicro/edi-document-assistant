import { StateGraph, START, END } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { DocumentAgentState, type DocumentClassification } from './state';
import { classifyPrompt, classificationParser } from './prompts/classify.prompt';
import { explainPurchaseOrderPrompt } from './prompts/explain-purchase-order.prompt';
import { explainInvoicePrompt } from './prompts/explain-invoice.prompt';
import { explainDespatchAdvicePrompt } from './prompts/explain-despatch-advice.prompt';
import { explainProductCatalogPrompt } from './prompts/explain-product-catalog.prompt';
import { analyzeDocumentPrompt } from '../langchain/prompts/analyze-document.prompt';
import {
  documentAnalysisParser,
  type DocumentAnalysis,
} from '../langchain/parsers/document-analysis.parser';

const logger = new Logger('DocumentAgent');

/**
 * Pure-code pre-processing. No LLM call.
 *
 * Computes a few cheap stats about the raw document so the rest of the
 * graph (and LangSmith traces) can show how big the input was. For
 * EDIFACT we count `'`-terminated segments; for CSV we count rows; for
 * XML/JSON we just record the character length.
 */
async function parseNode(
  state: typeof DocumentAgentState.State,
): Promise<Partial<typeof DocumentAgentState.State>> {
  const { content, format } = state;
  const segmentCount =
    format === 'edifact'
      ? content.split("'").filter((s) => s.trim().length > 0).length
      : format === 'csv'
        ? content.split('\n').filter((line) => line.trim().length > 0).length
        : 1; // XML / JSON treated as a single document
  logger.debug(`PARSE: format=${format} length=${content.length} segments=${segmentCount}`);
  return { contentLength: content.length, segmentCount };
}

/**
 * First LLM call — asks the model to pick one of 5 classifications.
 *
 * Uses a small dedicated prompt + closed-enum Zod schema so the response
 * is fast and the value is safe to use as a routing key.
 */
async function classifyNode(
  state: typeof DocumentAgentState.State,
): Promise<Partial<typeof DocumentAgentState.State>> {
  const messages = await classifyPrompt.formatMessages({
    format: state.format,
    filename: state.filename,
    content: state.content,
    format_instructions: classificationParser.getFormatInstructions(),
  });
  const response = await state.llm.invoke(messages);
  const text = typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);
  const parsed = await classificationParser.parse(text);
  logger.debug(`CLASSIFY: ${parsed.classification} — ${parsed.reason}`);
  return {
    classification: parsed.classification,
    classifyRawResponse: text,
  };
}

/**
 * Conditional routing function — runs after CLASSIFY.
 *
 * Returns the name of the next node to execute. The names must match the
 * keys in `addConditionalEdges` below. This is the assessment-relevant
 * "graph not chain" moment: a chain can't make this kind of decision,
 * but a graph can route to a different node depending on what the model
 * just said.
 */
function routeAfterClassify(
  state: typeof DocumentAgentState.State,
): 'explainPurchaseOrder' | 'explainInvoice' | 'explainDespatchAdvice' | 'explainProductCatalog' | 'explainGeneric' {
  const c: DocumentClassification = state.classification;
  switch (c) {
    case 'purchase_order':
      return 'explainPurchaseOrder';
    case 'invoice':
      return 'explainInvoice';
    case 'despatch_advice':
      return 'explainDespatchAdvice';
    case 'product_catalog':
      return 'explainProductCatalog';
    case 'other':
    default:
      return 'explainGeneric';
  }
}

/**
 * Builds an explain node bound to a specific prompt template.
 *
 * Each branch of the graph uses one of these — purchase orders get the
 * PO-specific prompt, invoices get the invoice-specific prompt, and so
 * on. They all return the same `DocumentAnalysis` shape so downstream
 * persistence is unchanged.
 */
function buildExplainNode(
  prompt: typeof analyzeDocumentPrompt,
  branchName: string,
) {
  return async function explainNode(
    state: typeof DocumentAgentState.State,
  ): Promise<Partial<typeof DocumentAgentState.State>> {
    const messages = await prompt.formatMessages({
      format: state.format,
      filename: state.filename,
      content: state.content,
      format_instructions: documentAnalysisParser.getFormatInstructions(),
    });
    const response = await state.llm.invoke(messages);
    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
    const analysis: DocumentAnalysis = await documentAnalysisParser.parse(text);
    logger.debug(`EXPLAIN[${branchName}]: extracted ${Object.keys(analysis).length} top-level fields`);
    return { analysis, explainRawResponse: text };
  };
}

/**
 * Final node — folds the per-type extraction into a final list of
 * suggested actions. No LLM call: the explain prompts are already asked
 * to produce `suggestedActions`, so this node just promotes them onto
 * the state and logs.
 *
 * Kept as a separate node (rather than merged into explain) so the
 * graph traces in LangSmith show "this is where suggestions happen" as
 * a distinct, inspectable step.
 */
async function suggestNode(
  state: typeof DocumentAgentState.State,
): Promise<Partial<typeof DocumentAgentState.State>> {
  const suggestedActions = state.analysis?.suggestedActions ?? [];
  logger.debug(`SUGGEST: ${suggestedActions.length} suggested actions`);
  return { suggestedActions };
}

/**
 * Compile the graph once at module load time.
 *
 * The compiled graph is stateless and reusable — every `invoke()` call
 * starts a fresh state from the inputs we pass in.
 */
export function buildDocumentAgent() {
  const graph = new StateGraph(DocumentAgentState)
    .addNode('parse', parseNode)
    .addNode('classify', classifyNode)
    .addNode('explainPurchaseOrder', buildExplainNode(explainPurchaseOrderPrompt, 'purchase_order'))
    .addNode('explainInvoice', buildExplainNode(explainInvoicePrompt, 'invoice'))
    .addNode('explainDespatchAdvice', buildExplainNode(explainDespatchAdvicePrompt, 'despatch_advice'))
    .addNode('explainProductCatalog', buildExplainNode(explainProductCatalogPrompt, 'product_catalog'))
    .addNode('explainGeneric', buildExplainNode(analyzeDocumentPrompt, 'other'))
    .addNode('suggest', suggestNode)
    .addEdge(START, 'parse')
    .addEdge('parse', 'classify')
    .addConditionalEdges('classify', routeAfterClassify, {
      explainPurchaseOrder: 'explainPurchaseOrder',
      explainInvoice: 'explainInvoice',
      explainDespatchAdvice: 'explainDespatchAdvice',
      explainProductCatalog: 'explainProductCatalog',
      explainGeneric: 'explainGeneric',
    })
    .addEdge('explainPurchaseOrder', 'suggest')
    .addEdge('explainInvoice', 'suggest')
    .addEdge('explainDespatchAdvice', 'suggest')
    .addEdge('explainProductCatalog', 'suggest')
    .addEdge('explainGeneric', 'suggest')
    .addEdge('suggest', END);

  return graph.compile();
}

export type DocumentAgent = ReturnType<typeof buildDocumentAgent>;
