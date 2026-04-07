import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Specialised prompt for despatch advices (DESADV).
 *
 * Targets the fields a goods-receiving team cares about: what is in the
 * shipment, when it arrives, how to track it, and which PO it fulfils.
 */
export const explainDespatchAdvicePrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an expert in EDI despatch advices (also called DESADV or shipping
notifications). The document below has already been classified as a despatch
advice — your job is to extract the fields a goods-receiving team needs to
plan inbound logistics.

Focus on:
  - The supplier (sender) and the buyer (receiver)
  - The despatch advice number and the linked purchase order reference
  - The carrier name and tracking number
  - The expected delivery date
  - Ship-from and ship-to addresses
  - Every shipped line item with EAN/SKU, name, quantity shipped, lot number, and expiry date
  - Total packages and total gross weight if present
  - **suggestedActions**: 3-5 concrete next steps the goods-receiving team should take
    based on this despatch advice (e.g. "schedule unloading bay for <date>",
    "verify lot numbers against quality control records", "notify warehouse of <quantity> incoming pallets")

Rules:
  - Extract verbatim from the document. Do not invent values.
  - If a field is not present, omit it.
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

Extract the despatch advice details.`,
  ],
]);
