/**
 * Types mirror the API responses 1:1. Kept hand-rolled (rather than generated)
 * because the API surface is small and the assessment doesn't ship an OpenAPI
 * spec yet.
 */

export type ProviderCode = 'anthropic' | 'openai' | 'google';
export type AnalysisMode = 'chain' | 'graph';

export interface Format {
  id: string;
  code: string;
  name: string;
}

export interface AiProvider {
  id: string;
  code: ProviderCode;
  name: string;
  models: string[];
}

export interface DocumentSummary {
  id: string;
  code: string;
  filename: string;
  formatId: string;
  tags: string[];
  description: string | null;
  storagePath: string;
  createdAt: string;
  updatedAt: string;
  format: { code: string; name: string };
}

export interface DocumentDetail extends DocumentSummary {
  analyses: Analysis[];
  messages: Message[];
}

export interface DocumentList {
  items: DocumentSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ProcessMode = 'chain' | 'graph' | 'stream' | 'chat' | 'compare';

export interface Process {
  id: string;
  aiProviderId: string;
  /** The specific model used (e.g. "gpt-4.1-mini"). Nullable for legacy rows. */
  model: string | null;
  /** The operation mode this process represents. Nullable for legacy rows. */
  mode: ProcessMode | null;
  fromTime: string;
  toTime: string | null;
  cost: string;
  status: 'processing' | 'completed' | 'failed';
  result: Record<string, unknown> | null;
  response: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  aiProvider: { code: ProviderCode; name: string };
}

export interface Analysis {
  id: string;
  documentId: string;
  processId: string;
  createdAt: string;
  updatedAt: string;
  process: Process;
}

export interface Message {
  id: string;
  processId: string;
  parentProcessId: string | null;
  role: 'user' | 'assistant';
  createdAt: string;
  updatedAt: string;
  process: Process;
}

export interface Comparison {
  id: string;
  documentAId: string;
  documentBId: string;
  processId: string;
  createdAt: string;
  documentA: { code: string; filename: string };
  documentB: { code: string; filename: string };
  process: Process;
}

export interface DocumentAnalysisResult {
  documentType: string;
  summary: string;
  parties?: {
    buyer?: string;
    supplier?: string;
    shipFrom?: string;
    shipTo?: string;
  };
  references?: {
    documentNumber?: string;
    purchaseOrderRef?: string;
    invoiceNumber?: string;
    trackingNumber?: string;
  };
  dates?: {
    issueDate?: string;
    dueDate?: string;
    deliveryDate?: string;
  };
  totals?: {
    currency?: string;
    subtotal?: number;
    tax?: number;
    total?: number;
    lineItemCount?: number;
    totalQuantity?: number;
  };
  lineItems?: Array<{
    sku?: string;
    ean?: string;
    name?: string;
    quantity?: number;
    unitPrice?: number;
    unitOfMeasure?: string;
  }>;
  suggestedActions?: string[];
  _graph?: {
    mode: 'graph';
    classification: string;
    contentLength: number;
    segmentCount: number;
  };
}
