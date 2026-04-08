'use client';

import * as React from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAnalysisStream } from '@/lib/hooks/use-analysis-stream';
import type { ProviderCode } from '@/lib/types';

interface AnalysisStreamPanelProps {
  documentCode: string;
  providerCode: ProviderCode;
  model: string;
  onComplete: () => void;
  onCancel: () => void;
}

/**
 * The "typewriter" panel that renders the streaming analysis as the LLM
 * tokens arrive. Mounted by `RunAnalysisDialog` once the user picks
 * Stream mode and clicks Run.
 *
 * The hook closes the EventSource on unmount which propagates a
 * `req.on('close')` signal to the API → Phase 5's `AbortController`
 * cancels the LLM call mid-stream. So clicking "Cancel" actually saves
 * tokens.
 */
export function AnalysisStreamPanel({
  documentCode,
  providerCode,
  model,
  onComplete,
  onCancel,
}: AnalysisStreamPanelProps) {
  const { status, text, savedAnalysisId, error } = useAnalysisStream(
    documentCode,
    providerCode,
    model,
  );

  const containerRef = React.useRef<HTMLPreElement>(null);

  // Auto-scroll to the bottom of the textarea as new tokens arrive
  React.useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text]);

  // Auto-close once saved + a brief moment for the user to see the success
  React.useEffect(() => {
    if (status === 'completed' && savedAnalysisId) {
      const t = setTimeout(onComplete, 1200);
      return () => clearTimeout(t);
    }
  }, [status, savedAnalysisId, onComplete]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <StatusIcon status={status} />
        <StatusLabel status={status} />
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {providerCode}/{model}
        </span>
      </div>

      <pre
        ref={containerRef}
        className="max-h-[40vh] min-h-[200px] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap"
      >
        {text || (
          <span className="text-muted-foreground">
            Waiting for the first token...
          </span>
        )}
      </pre>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end">
        {status === 'completed' ? (
          <Button onClick={onComplete}>Done</Button>
        ) : (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: ReturnType<typeof useAnalysisStream>['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    default:
      return <Loader2 className="h-4 w-4 animate-spin" />;
  }
}

function StatusLabel({ status }: { status: ReturnType<typeof useAnalysisStream>['status'] }) {
  const labels: Record<typeof status, string> = {
    idle: 'Idle',
    starting: 'Connecting...',
    streaming: 'Streaming tokens...',
    saving: 'Saving...',
    completed: 'Saved',
    error: 'Failed',
  };
  return <span className="font-medium">{labels[status]}</span>;
}
