import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Prompt for the document analysis chain.
 *
 * The system message anchors the model as an EDI domain expert and asks for
 * a strict JSON response. The user message carries the format hint and the
 * raw document body.
 *
 * `{format_instructions}` is filled in by the structured output parser at
 * runtime so the model knows the exact JSON shape to produce.
 */
export const analyzeDocumentPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an expert in Electronic Data Interchange (EDI) documents exchanged
between retailers and suppliers. You can read documents in any of these formats:
EDIFACT, XML, JSON, or CSV.

Your job is to read a document and produce a structured analysis that a
non-technical supplier could use to understand it instantly.

Rules:
- Detect the document type from the content (e.g. purchase order, invoice,
  despatch advice, product catalog, or other) — do not assume it from the format.
- Extract concrete fields (parties, dates, references, totals, line items) verbatim
  from the document. Do not invent values.
- If a field is not present, omit it. Do not output null or "unknown".
- Respond with JSON only, matching the schema below. No prose, no markdown fences.

{format_instructions}`,
  ],
  [
    'human',
    `Format: {format}
Filename: {filename}

Document content:
---
{content}
---

Analyze this document.`,
  ],
]);
