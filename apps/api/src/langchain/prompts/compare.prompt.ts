import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Prompt for comparing two documents (or two analyses of the same document).
 *
 * The system message asks for a structured diff with three sections:
 * agreement, differences, and a recommendation. The user message carries
 * the two payloads. The structured output parser injected via
 * `{format_instructions}` enforces the exact JSON shape.
 */
export const comparePrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You compare two payloads and produce a structured diff a non-technical
supplier can read. Each payload may be a raw EDI document, a previous
analysis result (JSON), or both.

Your job:
- Identify what the two payloads agree on (same value).
- Identify where they differ (with both values side by side and a one-line
  note about why the difference matters).
- Produce a one-paragraph recommendation: which one is more reliable, more
  complete, more readable, or — if comparing two different documents — what
  their relationship is (related / unrelated).

Rules:
- Use the labels provided for each side ({labelA} vs {labelB}).
- Quote exact values verbatim — do not paraphrase.
- Respond with JSON only matching the schema below. No prose, no markdown fences.

{format_instructions}`,
  ],
  [
    'human',
    `Comparison type: {comparisonType}

==== {labelA} ====
{payloadA}

==== {labelB} ====
{payloadB}

Produce the structured comparison.`,
  ],
]);
