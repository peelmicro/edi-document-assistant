import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Specialised prompt for invoices.
 *
 * Targets the fields an accounts-payable team cares about: amounts, VAT
 * breakdown, payment terms, and the linked PO.
 */
export const explainInvoicePrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an expert in EDI invoices. The document below has already been
classified as an invoice — your job is to extract the fields an accounts-payable
team needs to verify and pay it.

Focus on:
  - The supplier and the customer (name and/or VAT/GLN identifier)
  - The invoice number and the linked purchase order reference (if any)
  - The issue date and the due date
  - The currency
  - Subtotal (net), VAT amount, and total (gross)
  - Payment terms (e.g. "Net 30 days")
  - Every line item with name, quantity, unit price, and total

Rules:
  - Extract verbatim from the document. Do not invent values.
  - Money amounts must be numbers, not strings.
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

Extract the invoice details.`,
  ],
]);
