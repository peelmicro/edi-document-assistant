'use client';

import * as React from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, GitCompare, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createComparison, fetchComparisons, fetchDocuments, fetchProviders } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { ProviderCode, Comparison } from '@/lib/types';

interface ComparePageProps {
  params: Promise<{ code: string }>;
}

type ComparisonType = 'cross_document' | 'cross_provider';

interface DiffValue {
  a?: unknown;
  b?: unknown;
  note: string;
}

interface ComparisonResult {
  agreement?: Record<string, unknown>;
  differences?: Record<string, DiffValue>;
  recommendation?: string;
  relationship?: string;
}

/**
 * Comparison page — Client Component because it's all interactive forms.
 *
 * Two modes:
 *   - cross_document: pick another document and a (provider, model)
 *   - cross_provider: pick two (provider, model) pairs and a judge
 *
 * Both POST to /comparisons and render the structured diff in a
 * side-by-side grid (agreement | differences) plus the model's
 * recommendation paragraph.
 */
export default function ComparePage({ params }: ComparePageProps) {
  const { code } = use(params);
  const queryClient = useQueryClient();

  const [type, setType] = React.useState<ComparisonType>('cross_document');

  // Cross-document state
  const [otherDocCode, setOtherDocCode] = React.useState<string>('');
  const [providerCode, setProviderCode] = React.useState<ProviderCode>('anthropic');
  const [model, setModel] = React.useState<string>('claude-haiku-4-5-20251001');

  // Cross-provider state
  const [providerACode, setProviderACode] = React.useState<ProviderCode>('anthropic');
  const [modelA, setModelA] = React.useState<string>('claude-haiku-4-5-20251001');
  const [providerBCode, setProviderBCode] = React.useState<ProviderCode>('openai');
  const [modelB, setModelB] = React.useState<string>('gpt-4.1-mini');
  const [judgeProviderCode, setJudgeProviderCode] = React.useState<ProviderCode>('google');
  const [judgeModel, setJudgeModel] = React.useState<string>('gemini-2.5-flash');

  const documentsQuery = useQuery({
    queryKey: ['documents', { pageSize: 100 }],
    queryFn: () => fetchDocuments({ pageSize: 100 }),
  });

  const providersQuery = useQuery({
    queryKey: ['ai-providers'],
    queryFn: fetchProviders,
  });

  // All comparisons (we filter client-side to the ones touching this document)
  const comparisonsQuery = useQuery({
    queryKey: ['comparisons'],
    queryFn: fetchComparisons,
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (type === 'cross_document') {
        if (!otherDocCode) throw new Error('Pick another document to compare against');
        return createComparison({
          type: 'cross_document',
          documentACode: code,
          documentBCode: otherDocCode,
          providerCode,
          model,
        });
      }
      return createComparison({
        type: 'cross_provider',
        documentCode: code,
        providerACode,
        modelA,
        providerBCode,
        modelB,
        judgeProviderCode,
        judgeModel,
      });
    },
    onSuccess: () => {
      // Refetch the history list so the new comparison appears
      queryClient.invalidateQueries({ queryKey: ['comparisons'] });
    },
  });

  const otherDocs = documentsQuery.data?.items.filter((d) => d.code !== code) ?? [];
  const currentDoc = documentsQuery.data?.items.find((d) => d.code === code);
  const result = mutation.data?.process.result as ComparisonResult | null;

  // Past comparisons that involve this document (either side)
  const pastComparisons = React.useMemo(() => {
    if (!comparisonsQuery.data || !currentDoc) return [];
    return comparisonsQuery.data
      .filter((c) => c.documentAId === currentDoc.id || c.documentBId === currentDoc.id)
      // Hide the freshly-run one — it's already shown in the live result panel above
      .filter((c) => c.id !== mutation.data?.id);
  }, [comparisonsQuery.data, currentDoc, mutation.data]);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/documents/${code}`}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to document
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compare</h1>
        <p className="text-sm text-muted-foreground">
          Compare <span className="font-mono">{code}</span>
          {currentDoc && (
            <>
              {' '}
              <span className="text-foreground">— {currentDoc.filename}</span>
            </>
          )}{' '}
          against another document, or run two providers on it side-by-side.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comparison setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <TypeButton
                active={type === 'cross_document'}
                onClick={() => setType('cross_document')}
                title="Cross-document"
                description="Compare against another document"
              />
              <TypeButton
                active={type === 'cross_provider'}
                onClick={() => setType('cross_provider')}
                title="Cross-provider"
                description="Same document, two providers, judged by a third"
              />
            </div>
          </div>

          {type === 'cross_document' ? (
            <>
              <div className="space-y-2">
                <Label>Compare against</Label>
                <Select value={otherDocCode} onValueChange={setOtherDocCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick another document" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherDocs.map((d) => (
                      <SelectItem key={d.code} value={d.code}>
                        {d.code} — {d.filename}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ProviderModelPicker
                providers={providersQuery.data ?? []}
                providerCode={providerCode}
                model={model}
                onProviderChange={(c) => {
                  setProviderCode(c);
                  const p = providersQuery.data?.find((p) => p.code === c);
                  if (p?.models[0]) setModel(p.models[0]);
                }}
                onModelChange={setModel}
                label="Judge"
              />
            </>
          ) : (
            <>
              <ProviderModelPicker
                providers={providersQuery.data ?? []}
                providerCode={providerACode}
                model={modelA}
                onProviderChange={(c) => {
                  setProviderACode(c);
                  const p = providersQuery.data?.find((p) => p.code === c);
                  if (p?.models[0]) setModelA(p.models[0]);
                }}
                onModelChange={setModelA}
                label="Model A"
              />
              <ProviderModelPicker
                providers={providersQuery.data ?? []}
                providerCode={providerBCode}
                model={modelB}
                onProviderChange={(c) => {
                  setProviderBCode(c);
                  const p = providersQuery.data?.find((p) => p.code === c);
                  if (p?.models[0]) setModelB(p.models[0]);
                }}
                onModelChange={setModelB}
                label="Model B"
              />
              <ProviderModelPicker
                providers={providersQuery.data ?? []}
                providerCode={judgeProviderCode}
                model={judgeModel}
                onProviderChange={(c) => {
                  setJudgeProviderCode(c);
                  const p = providersQuery.data?.find((p) => p.code === c);
                  if (p?.models[0]) setJudgeModel(p.models[0]);
                }}
                onModelChange={setJudgeModel}
                label="Judge"
              />
            </>
          )}

          {mutation.isError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {(mutation.error as Error).message}
            </div>
          )}

          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <GitCompare className="mr-2 h-4 w-4" />
            {mutation.isPending ? 'Comparing... (this may take a while)' : 'Run comparison'}
          </Button>
        </CardContent>
      </Card>

      {result && <ComparisonResultPanel result={result} comparison={mutation.data!} />}

      {pastComparisons.length > 0 && (
        <PastComparisonsSection comparisons={pastComparisons} currentDocCode={code} />
      )}
    </div>
  );
}

/**
 * Lists every persisted Comparison row that involves this document, with
 * a click-to-expand panel for each one. Pulls from the `/comparisons`
 * endpoint we built in Phase 8.
 *
 * The currently-running mutation result is shown above this section, so
 * we filter it out to avoid showing it twice.
 */
function PastComparisonsSection({
  comparisons,
  currentDocCode,
}: {
  comparisons: Comparison[];
  currentDocCode: string;
}) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <History className="h-4 w-4" />
        Past comparisons ({comparisons.length})
      </h2>
      {comparisons.map((c) => {
        const isExpanded = expandedId === c.id;
        const otherDoc = c.documentA.code === currentDocCode ? c.documentB : c.documentA;
        const isCrossProvider = c.documentAId === c.documentBId;
        const result = c.process.result as ComparisonResult | null;
        return (
          <Card key={c.id}>
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : c.id)}
              className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-accent/40"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <Badge variant="secondary">
                    {isCrossProvider ? 'cross_provider' : 'cross_document'}
                  </Badge>
                  <span className="text-muted-foreground">judged by</span>
                  <span className="font-medium">{c.process.aiProvider.name}</span>
                  {c.process.model && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {c.process.model}
                    </span>
                  )}
                </div>
                {!isCrossProvider && (
                  <div className="pl-6 text-xs text-muted-foreground">
                    vs <span className="font-mono">{otherDoc.code}</span> — {otherDoc.filename}
                  </div>
                )}
                {result?.recommendation && !isExpanded && (
                  <p className="line-clamp-2 pl-6 text-sm text-muted-foreground">
                    {result.recommendation}
                  </p>
                )}
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {formatDate(c.createdAt)}
              </div>
            </button>
            {isExpanded && result && (
              <div className="border-t p-4">
                <ComparisonResultPanel result={result} comparison={c} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function TypeButton({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3 text-left transition-colors ${
        active ? 'border-primary bg-primary/5' : 'border-input hover:border-primary/50'
      }`}
    >
      <div className="font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </button>
  );
}

function ProviderModelPicker({
  providers,
  providerCode,
  model,
  onProviderChange,
  onModelChange,
  label,
}: {
  providers: Array<{ code: ProviderCode; name: string; models: string[] }>;
  providerCode: ProviderCode;
  model: string;
  onProviderChange: (code: ProviderCode) => void;
  onModelChange: (model: string) => void;
  label: string;
}) {
  const selected = providers.find((p) => p.code === providerCode);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        <Select value={providerCode} onValueChange={(v) => onProviderChange(v as ProviderCode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.code} value={p.code}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selected?.models.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ComparisonResultPanel({
  result,
  comparison,
}: {
  result: ComparisonResult;
  comparison: Comparison;
}) {
  const agreement = result.agreement ?? {};
  const differences = result.differences ?? {};

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Comparison {comparison.id.slice(0, 8)} • judged by{' '}
        <span className="font-medium">{comparison.process.aiProvider.name}</span>
      </div>

      {result.recommendation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommendation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{result.recommendation}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Agreement ({Object.keys(agreement).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(agreement).length === 0 ? (
              <p className="text-sm text-muted-foreground">No fields in agreement.</p>
            ) : (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
                {Object.entries(agreement).map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                    <dd className="wrap-break-word whitespace-pre-wrap">{formatValue(v)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Differences ({Object.keys(differences).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(differences).length === 0 ? (
              <p className="text-sm text-muted-foreground">No differences found.</p>
            ) : (
              <div className="space-y-3 text-sm">
                {Object.entries(differences).map(([k, diff]) => (
                  <div key={k} className="rounded-md border p-2">
                    <div className="font-mono text-xs text-muted-foreground">{k}</div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <div className="rounded bg-blue-500/10 px-2 py-1">
                        <div className="text-xs font-medium text-blue-700 dark:text-blue-400">A</div>
                        <div className="wrap-break-word">{formatValue(diff.a)}</div>
                      </div>
                      <div className="rounded bg-purple-500/10 px-2 py-1">
                        <div className="text-xs font-medium text-purple-700 dark:text-purple-400">B</div>
                        <div className="wrap-break-word">{formatValue(diff.b)}</div>
                      </div>
                    </div>
                    {diff.note && (
                      <div className="mt-1 text-xs text-muted-foreground">{diff.note}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Renders comparison values for the UI.
 *
 * Handles the four shapes the LLM might emit:
 *   - primitives  → as-is
 *   - null/undefined → em-dash
 *   - array of primitives → comma-joined
 *   - array of objects → newline-joined compact JSON (one row per item)
 *   - plain object → multi-line pretty JSON
 *
 * The previous version naively did `String(v)` and `v.map(String)`, which
 * collapsed any object into the literal string "[object Object]" — fine
 * for simple agreement values like `"EUR"` but useless for `lineItems`.
 */
function formatValue(v: unknown): string {
  if (v == null) return '—';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const allPrimitives = v.every((x) => typeof x !== 'object' || x === null);
    if (allPrimitives) return v.map((x) => String(x)).join(', ');
    return v.map((x) => JSON.stringify(x)).join('\n');
  }
  if (typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}
