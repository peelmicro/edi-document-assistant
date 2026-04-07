import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

/**
 * Prompt for follow-up questions about a previously analysed document.
 *
 * The system message gives the model the document content as context, plus
 * the analysis the user is asking about (so the model has the same view of
 * the document the human is looking at).
 *
 * `{history}` is filled in by `MessagesPlaceholder` from the prior chat
 * messages on the same thread, so the model has the full conversation
 * context, not just the latest question.
 *
 * `{question}` is the user's new question.
 */
export const chatPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an EDI document assistant helping a non-technical supplier
understand a document they have already received. The document is in
{format} format. Your previous structured analysis is included for context.

Document filename: {filename}

Document content:
---
{content}
---

Previous analysis (JSON):
{previousAnalysis}

When answering:
- Use information from the document content above as your source of truth.
- If the user's question cannot be answered from the document, say so plainly.
- Be concise — 1-3 sentences unless the user asks for detail.
- Quote exact values from the document where relevant.`,
  ],
  new MessagesPlaceholder('history'),
  ['human', '{question}'],
]);
