'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Workflow, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { analyzeDocument, fetchProviders } from '@/lib/api';
import type { ProviderCode, AnalysisMode } from '@/lib/types';
import { AnalysisStreamPanel } from '@/components/analysis-stream-panel';

interface RunAnalysisDialogProps {
  documentCode: string;
}

type RunMode = AnalysisMode | 'stream';

/**
 * Modal that lets the user run a new analysis on a document.
 *
 * Three modes:
 *   - chain  → POST /documents/:code/analyses { mode: 'chain' }
 *   - graph  → POST /documents/:code/analyses { mode: 'graph' }
 *   - stream → opens an SSE connection via the stream panel below
 *
 * On success the document detail query is invalidated so the new
 * analysis appears in the list automatically.
 */
export function RunAnalysisDialog({ documentCode }: RunAnalysisDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [providerCode, setProviderCode] = React.useState<ProviderCode | ''>('');
  const [model, setModel] = React.useState<string>('');
  const [mode, setMode] = React.useState<RunMode>('chain');
  const [streamingActive, setStreamingActive] = React.useState(false);

  const providersQuery = useQuery({
    queryKey: ['ai-providers'],
    queryFn: fetchProviders,
  });

  // When the user picks a provider, default the model to the first one
  React.useEffect(() => {
    if (!providerCode || !providersQuery.data) return;
    const provider = providersQuery.data.find((p) => p.code === providerCode);
    if (provider && provider.models.length > 0) {
      setModel(provider.models[0]);
    }
  }, [providerCode, providersQuery.data]);

  const selectedProvider = providersQuery.data?.find((p) => p.code === providerCode);

  const mutation = useMutation({
    mutationFn: () => {
      if (!providerCode || !model) throw new Error('Pick a provider and model');
      return analyzeDocument(documentCode, {
        providerCode,
        model,
        mode: mode === 'stream' ? undefined : mode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentCode] });
      setOpen(false);
    },
  });

  const handleRun = () => {
    if (mode === 'stream') {
      setStreamingActive(true);
    } else {
      mutation.mutate();
    }
  };

  const handleStreamComplete = () => {
    setStreamingActive(false);
    queryClient.invalidateQueries({ queryKey: ['document', documentCode] });
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Don't allow closing while a stream is in flight
        if (streamingActive && !o) return;
        setOpen(o);
        if (!o) {
          mutation.reset();
          setStreamingActive(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Sparkles className="mr-2 h-4 w-4" />
          Run new analysis
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run a new analysis</DialogTitle>
          <DialogDescription>
            Pick a provider, model, and analysis mode. The result is persisted as a
            new Analysis row on this document.
          </DialogDescription>
        </DialogHeader>

        {streamingActive && providerCode && model ? (
          <AnalysisStreamPanel
            documentCode={documentCode}
            providerCode={providerCode}
            model={model}
            onComplete={handleStreamComplete}
            onCancel={() => setStreamingActive(false)}
          />
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Select value={providerCode} onValueChange={(v) => setProviderCode(v as ProviderCode)}>
                <SelectTrigger id="provider">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {providersQuery.data?.map((p) => (
                    <SelectItem key={p.id} value={p.code}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Select value={model} onValueChange={setModel} disabled={!selectedProvider}>
                <SelectTrigger id="model">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {selectedProvider?.models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mode</Label>
              <div className="grid grid-cols-3 gap-2">
                <ModeButton
                  active={mode === 'chain'}
                  onClick={() => setMode('chain')}
                  icon={<Sparkles className="h-4 w-4" />}
                  label="Chain"
                  description="Single LLM call"
                />
                <ModeButton
                  active={mode === 'graph'}
                  onClick={() => setMode('graph')}
                  icon={<Workflow className="h-4 w-4" />}
                  label="Graph"
                  description="Multi-step agent"
                />
                <ModeButton
                  active={mode === 'stream'}
                  onClick={() => setMode('stream')}
                  icon={<Radio className="h-4 w-4" />}
                  label="Stream"
                  description="SSE token-by-token"
                />
              </div>
            </div>

            {mutation.isError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {(mutation.error as Error).message}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button onClick={handleRun} disabled={!providerCode || !model || mutation.isPending}>
                {mutation.isPending ? 'Analyzing...' : 'Run analysis'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3 text-left transition-colors ${
        active
          ? 'border-primary bg-primary/5'
          : 'border-input hover:border-primary/50 hover:bg-accent/50'
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        {icon}
        {label}
      </div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </button>
  );
}
