import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Specialised prompt for product catalogs.
 *
 * Targets the fields a buyer's procurement team cares about: what is on
 * offer, at what price, in which categories, and from where.
 */
export const explainProductCatalogPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an expert in supplier product catalogs. The document below has
already been classified as a product catalog — your job is to summarise
what's on offer so a buyer's procurement team can decide what to order.

Focus on:
  - The supplier name (if present)
  - The total number of items
  - The categories represented (deduplicated)
  - The currency
  - Price range (cheapest and most expensive items)
  - A representative sample of line items (up to ~10) with SKU, name, category, and unit price
  - **suggestedActions**: 3-5 concrete next steps a procurement team should take based on
    this catalog (e.g. "compare prices against current supplier <X>",
    "request samples for new categories", "check minimum order quantities for high-value items")

Rules:
  - Extract verbatim from the document. Do not invent values.
  - If the document has more than 10 line items, sample diverse ones (different categories) rather than just the first 10.
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

Summarise the product catalog.`,
  ],
]);
