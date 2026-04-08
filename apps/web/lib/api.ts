import type {
  AiProvider,
  Analysis,
  Comparison,
  DocumentDetail,
  DocumentList,
  Format,
  Message,
  ProviderCode,
  AnalysisMode,
} from './types';

/**
 * Centralised API client.
 *
 * Reads the API base URL from `NEXT_PUBLIC_API_URL` so the same code runs
 * on the server (during SSR) and in the browser. The variable lives in
 * the root `.env` (Phase 1) and defaults to localhost for dev.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers,
    },
    // Server Components: don't cache so a refresh always sees the latest
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, `${res.status} ${res.statusText}: ${text}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---- Lookups ----

export const fetchFormats = () => request<Format[]>('/formats');
export const fetchProviders = () => request<AiProvider[]>('/ai-providers');

// ---- Documents ----

export interface ListDocumentsParams {
  page?: number;
  pageSize?: number;
  formatCode?: string;
  search?: string;
}

export function fetchDocuments(params: ListDocumentsParams = {}) {
  const search = new URLSearchParams();
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  if (params.formatCode) search.set('formatCode', params.formatCode);
  if (params.search) search.set('search', params.search);
  const qs = search.toString();
  return request<DocumentList>(`/documents${qs ? `?${qs}` : ''}`);
}

export const fetchDocument = (code: string) => request<DocumentDetail>(`/documents/${code}`);

export const fetchDocumentContent = async (code: string): Promise<string> => {
  const res = await fetch(`${API_BASE_URL}/documents/${code}/content`, { cache: 'no-store' });
  if (!res.ok) throw new ApiError(res.status, `Failed to fetch document content`);
  return res.text();
};

export async function uploadDocument(file: File, opts: { description?: string; tags?: string }) {
  const form = new FormData();
  form.append('file', file);
  if (opts.description) form.append('description', opts.description);
  if (opts.tags) form.append('tags', opts.tags);
  return request<DocumentDetail>('/documents', { method: 'POST', body: form });
}

export const deleteDocument = (code: string) =>
  request<{ code: string; deleted: true }>(`/documents/${code}`, { method: 'DELETE' });

// ---- Analyses ----

export interface AnalyzeRequest {
  providerCode: ProviderCode;
  model: string;
  mode?: AnalysisMode;
}

export const analyzeDocument = (code: string, body: AnalyzeRequest) =>
  request<Analysis>(`/documents/${code}/analyses`, { method: 'POST', body: JSON.stringify(body) });

/**
 * Returns the SSE URL for the streaming analysis endpoint. The hook in
 * `lib/hooks/use-analysis-stream.ts` opens this with `EventSource`.
 */
export function streamAnalysisUrl(code: string, providerCode: ProviderCode, model: string) {
  const params = new URLSearchParams({ providerCode, model });
  return `${API_BASE_URL}/documents/${code}/analyses/stream?${params.toString()}`;
}

// ---- Messages ----

export interface AskMessageRequest {
  parentProcessId: string;
  providerCode: ProviderCode;
  model: string;
  question: string;
}

export const fetchMessages = (code: string, parentProcessId: string) =>
  request<Message[]>(`/documents/${code}/messages?parentProcessId=${parentProcessId}`);

export const askMessage = (code: string, body: AskMessageRequest) =>
  request<Message>(`/documents/${code}/messages`, { method: 'POST', body: JSON.stringify(body) });

// ---- Comparisons ----

export type ComparisonRequest =
  | {
      type: 'cross_document';
      documentACode: string;
      documentBCode: string;
      providerCode: ProviderCode;
      model: string;
    }
  | {
      type: 'cross_provider';
      documentCode: string;
      providerACode: ProviderCode;
      modelA: string;
      providerBCode: ProviderCode;
      modelB: string;
      judgeProviderCode: ProviderCode;
      judgeModel: string;
    };

export const fetchComparisons = () => request<Comparison[]>('/comparisons');
export const createComparison = (body: ComparisonRequest) =>
  request<Comparison>('/comparisons', { method: 'POST', body: JSON.stringify(body) });
