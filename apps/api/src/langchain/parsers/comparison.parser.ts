import { z } from 'zod';
import { StructuredOutputParser } from '@langchain/core/output_parsers';

/**
 * Zod schema for the structured comparison the LLM must return.
 *
 * Mirrors the seed data shape from Phase 2 so the comparison feature stays
 * compatible with the rows already in the database.
 */
// Comparison values are inherently freeform — they can be a string, number,
// boolean, an array (e.g. line items, suggested actions), an object, or null
// (when one side is missing the field). `z.unknown()` lets the parser accept
// whatever the model produces while still validating the surrounding shape.
const comparisonValue = z.unknown();

export const comparisonSchema = z.object({
  comparisonType: z.enum(['cross_provider', 'cross_document']),
  agreement: z
    .record(z.string(), comparisonValue)
    .optional()
    .describe('Fields whose values match in both payloads.'),
  differences: z
    .record(
      z.string(),
      z.object({
        a: comparisonValue.optional(),
        b: comparisonValue.optional(),
        note: z.string().describe('A one-line explanation of why this difference matters.'),
      }),
    )
    .optional()
    .describe('Fields where the two payloads disagree.'),
  recommendation: z
    .string()
    .describe('A one-paragraph plain-English summary the user can act on.'),
  relationship: z
    .enum(['related', 'unrelated', 'unknown'])
    .optional()
    .describe('For cross_document comparisons: are the two documents linked?'),
});

export type Comparison = z.infer<typeof comparisonSchema>;

export const comparisonParser = StructuredOutputParser.fromZodSchema(comparisonSchema);
