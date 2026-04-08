'use client';

import * as React from 'react';
import { streamAnalysisUrl } from '@/lib/api';
import type { ProviderCode } from '@/lib/types';

export type StreamStatus = 'idle' | 'starting' | 'streaming' | 'saving' | 'completed' | 'error';

export interface UseAnalysisStreamResult {
  status: StreamStatus;
  /** The accumulated raw text as the LLM tokens stream in. */
  text: string;
  /** Set after the `analysis-saved` SSE event arrives. */
  savedAnalysisId: string | null;
  /** Error message if status === 'error'. */
  error: string | null;
  /** Manually abort the in-flight stream. */
  cancel: () => void;
}

/**
 * Opens an `EventSource` to the SSE analysis endpoint and surfaces the
 * stream as React state.
 *
 * Lifecycle:
 *   1. status: 'starting' once the EventSource is opened
 *   2. status: 'streaming' as soon as the first token event arrives
 *   3. status: 'saving' once the model is done (analysis-saved event)
 *      → wait for the actual save signal which the API sends as the same event
 *   4. status: 'completed' once `analysis-saved` lands → savedAnalysisId is set
 *
 * On unmount the EventSource is closed and the API will receive its
 * `req.on('close')` signal — which triggers the `AbortController` we wired
 * into `LangChainService.streamAnalyzeDocument` back in Phase 5.
 */
export function useAnalysisStream(
  code: string | null,
  providerCode: ProviderCode | null,
  model: string | null,
): UseAnalysisStreamResult {
  const [status, setStatus] = React.useState<StreamStatus>('idle');
  const [text, setText] = React.useState('');
  const [savedAnalysisId, setSavedAnalysisId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const eventSourceRef = React.useRef<EventSource | null>(null);

  const cancel = React.useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  React.useEffect(() => {
    if (!code || !providerCode || !model) return;

    setStatus('starting');
    setText('');
    setSavedAnalysisId(null);
    setError(null);

    const url = streamAnalysisUrl(code, providerCode, model);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('started', () => {
      setStatus('streaming');
    });

    es.addEventListener('token', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { token: string };
      setText((prev) => prev + data.token);
    });

    es.addEventListener('analysis-saved', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { analysisId: string };
      setSavedAnalysisId(data.analysisId);
      setStatus('completed');
      es.close();
    });

    es.addEventListener('error', (event) => {
      // EventSource fires `error` both for network drops and for our own
      // server-sent error events. Try to read the payload first; if it's a
      // plain network error there's no `data`.
      const messageEvent = event as MessageEvent;
      if (messageEvent.data) {
        try {
          const data = JSON.parse(messageEvent.data) as { message: string };
          setError(data.message);
        } catch {
          setError('Stream error');
        }
      } else {
        setError('Connection lost');
      }
      setStatus('error');
      es.close();
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [code, providerCode, model]);

  return { status, text, savedAnalysisId, error, cancel };
}
