import { z } from 'zod';
import { StructuredOutputParser } from '@langchain/core/output_parsers';

/**
 * Zod schema for the analysis the LLM must return.
 *
 * Kept intentionally generic so it works for any EDI format and any
 * document subtype (purchase order, invoice, despatch advice, catalog, …).
 * Most fields are optional — the model is told to omit anything it cannot
 * find rather than invent or null it out.
 */
export const documentAnalysisSchema = z.object({
  documentType: z
    .string()
    .describe(
      'Detected document subtype, e.g. "purchase_order", "invoice", "despatch_advice", "product_catalog", or "other".',
    ),
  summary: z
    .string()
    .describe(
      'A 1-3 sentence natural-language summary a non-technical supplier could read.',
    ),
  parties: z
    .object({
      buyer: z.string().nullish().describe('Buyer name and/or identifier (e.g. GLN).'),
      supplier: z.string().nullish().describe('Supplier name and/or identifier.'),
      shipFrom: z.string().nullish(),
      shipTo: z.string().nullish(),
    })
    .nullish(),
  references: z
    .object({
      documentNumber: z.string().nullish().describe('The document\'s own number/code.'),
      purchaseOrderRef: z
        .string()
        .nullish()
        .describe('Linked PO reference, if this is an invoice or despatch advice.'),
      invoiceNumber: z.string().nullish(),
      trackingNumber: z.string().nullish(),
    })
    .nullish(),
  dates: z
    .object({
      issueDate: z.string().nullish(),
      dueDate: z.string().nullish(),
      deliveryDate: z.string().nullish(),
    })
    .nullish(),
  totals: z
    .object({
      currency: z.string().nullish(),
      subtotal: z.number().nullish(),
      tax: z.number().nullish(),
      total: z.number().nullish(),
      lineItemCount: z.number().nullish(),
      totalQuantity: z.number().nullish(),
    })
    .nullish(),
  lineItems: z
    .array(
      // Use `.nullish()` (= optional + nullable) instead of `.optional()`
      // because some models (notably OpenAI gpt-4.1-nano) emit explicit
      // `null` for missing fields rather than omitting the key. Strict
      // `.optional()` would reject those payloads.
      z.object({
        sku: z.string().nullish(),
        ean: z.string().nullish(),
        name: z.string().nullish(),
        quantity: z.number().nullish(),
        unitPrice: z.number().nullish(),
        unitOfMeasure: z.string().nullish(),
      }),
    )
    .optional()
    .describe('Up to ~20 line items. Omit if the document has no line items.'),
  suggestedActions: z
    .array(z.string())
    .optional()
    .describe('Concrete next steps the supplier should take based on this document.'),
});

export type DocumentAnalysis = z.infer<typeof documentAnalysisSchema>;

export const documentAnalysisParser =
  StructuredOutputParser.fromZodSchema(documentAnalysisSchema);
