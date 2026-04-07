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
      buyer: z.string().optional().describe('Buyer name and/or identifier (e.g. GLN).'),
      supplier: z.string().optional().describe('Supplier name and/or identifier.'),
      shipFrom: z.string().optional(),
      shipTo: z.string().optional(),
    })
    .optional(),
  references: z
    .object({
      documentNumber: z.string().optional().describe('The document\'s own number/code.'),
      purchaseOrderRef: z
        .string()
        .optional()
        .describe('Linked PO reference, if this is an invoice or despatch advice.'),
      invoiceNumber: z.string().optional(),
      trackingNumber: z.string().optional(),
    })
    .optional(),
  dates: z
    .object({
      issueDate: z.string().optional(),
      dueDate: z.string().optional(),
      deliveryDate: z.string().optional(),
    })
    .optional(),
  totals: z
    .object({
      currency: z.string().optional(),
      subtotal: z.number().optional(),
      tax: z.number().optional(),
      total: z.number().optional(),
      lineItemCount: z.number().optional(),
      totalQuantity: z.number().optional(),
    })
    .optional(),
  lineItems: z
    .array(
      z.object({
        sku: z.string().optional(),
        ean: z.string().optional(),
        name: z.string().optional(),
        quantity: z.number().optional(),
        unitPrice: z.number().optional(),
        unitOfMeasure: z.string().optional(),
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
