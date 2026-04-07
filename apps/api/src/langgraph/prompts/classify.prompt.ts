import { z } from 'zod';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';

/**
 * Tiny prompt + parser used by the CLASSIFY node.
 *
 * The model only has to return one enum value, so the call is fast and
 * cheap. The structured parser plus the closed enum schema make sure the
 * value can be used directly as a routing key by the conditional edge.
 */
export const classificationSchema = z.object({
  classification: z
    .enum(['purchase_order', 'invoice', 'despatch_advice', 'product_catalog', 'other'])
    .describe('The detected document subtype.'),
  reason: z
    .string()
    .describe('A short (1 sentence) justification — what in the document indicated this type.'),
});

export const classificationParser = StructuredOutputParser.fromZodSchema(classificationSchema);

export const classifyPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You classify EDI documents exchanged between retailers and suppliers.
The document is in one of these formats: EDIFACT, XML, JSON, or CSV.

Pick ONE classification from this closed set:
  - purchase_order — a buyer ordering products from a supplier
  - invoice — a supplier billing a buyer
  - despatch_advice — a supplier notifying a buyer that goods have shipped
  - product_catalog — a list of products, prices, and codes
  - other — anything else

Respond with JSON only. No prose, no markdown fences.

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

Classify this document.`,
  ],
]);
