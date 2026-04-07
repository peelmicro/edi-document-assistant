import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Specialised prompt for purchase orders.
 *
 * Targets the fields a supplier cares about most when receiving a PO:
 * who is buying, what they want, how much, and when it must arrive.
 */
export const explainPurchaseOrderPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an expert in EDI purchase orders. The document below has already
been classified as a purchase order — your job is to extract the fields a
supplier needs to fulfil it.

Focus on:
  - The buyer (name and/or GLN identifier)
  - The supplier (name and/or GLN identifier)
  - The PO number / document reference
  - The order date and the requested delivery date
  - Every line item with EAN/SKU, name, quantity, unit price, and unit of measure
  - Total quantity across all line items
  - The currency

Rules:
  - Extract verbatim from the document. Do not invent values.
  - If a field is not present, omit it. Do not output null or "unknown".
  - Respond with JSON only matching the schema below. No prose, no markdown fences.

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

Extract the purchase order details.`,
  ],
]);
