'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Workflow, Sparkles, Radio, MessagesSquare, GitCompare } from 'lucide-react';
import type { Analysis, ProcessMode } from '@/lib/types';
import type { DocumentAnalysisResult } from '@/lib/types';
import { formatDate } from '@/lib/utils';

/**
 * Renders a single Analysis (Process + result) as a card.
 *
 * Designed to handle missing/optional fields gracefully — if the model
 * didn't extract `parties` or `lineItems`, the section is just skipped.
 *
 * Failed analyses (status === 'failed') render the error message instead
 * of trying to interpret a null result.
 */
const MODE_META: Record<ProcessMode, { label: string; icon: React.ReactNode }> = {
  chain: { label: 'chain', icon: <Sparkles className="mr-1 h-3 w-3" /> },
  graph: { label: 'graph', icon: <Workflow className="mr-1 h-3 w-3" /> },
  stream: { label: 'stream', icon: <Radio className="mr-1 h-3 w-3" /> },
  chat: { label: 'chat', icon: <MessagesSquare className="mr-1 h-3 w-3" /> },
  compare: { label: 'compare', icon: <GitCompare className="mr-1 h-3 w-3" /> },
};

export function AnalysisResultCard({ analysis }: { analysis: Analysis }) {
  const { process } = analysis;
  const isFailed = process.status === 'failed';
  const result = process.result as DocumentAnalysisResult | null;
  // Prefer the persisted mode column; fall back to sniffing _graph for legacy
  // rows that were created before the column existed.
  const mode: ProcessMode | null =
    process.mode ?? (result?._graph?.mode === 'graph' ? 'graph' : null);
  const modeMeta = mode ? MODE_META[mode] : null;

  const durationMs = process.toTime
    ? new Date(process.toTime).getTime() - new Date(process.fromTime).getTime()
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {isFailed ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
              {process.aiProvider.name}
              {modeMeta && (
                <Badge variant="secondary" className="ml-1">
                  {modeMeta.icon}
                  {modeMeta.label}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="font-mono text-xs">
              {process.model ?? '(model unknown)'}
            </CardDescription>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {durationMs !== null && <div>{(durationMs / 1000).toFixed(1)}s</div>}
            <div>{formatDate(analysis.createdAt)}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isFailed && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive">
            <strong>Failed:</strong> {process.errorMessage ?? 'Unknown error'}
          </div>
        )}

        {!isFailed && result && (
          <>
            {result.documentType && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Type:</span>
                <Badge variant="outline">{result.documentType}</Badge>
                {result._graph?.classification && (
                  <span className="text-xs text-muted-foreground">
                    (graph classified: {result._graph.classification})
                  </span>
                )}
              </div>
            )}

            {result.summary && <p className="leading-relaxed">{result.summary}</p>}

            {result.parties && Object.keys(result.parties).length > 0 && (
              <Section title="Parties">
                <DefinitionList entries={result.parties} />
              </Section>
            )}

            {result.references && Object.keys(result.references).length > 0 && (
              <Section title="References">
                <DefinitionList entries={result.references} />
              </Section>
            )}

            {result.dates && Object.keys(result.dates).length > 0 && (
              <Section title="Dates">
                <DefinitionList entries={result.dates} />
              </Section>
            )}

            {result.totals && Object.keys(result.totals).length > 0 && (
              <Section title="Totals">
                <DefinitionList entries={result.totals} />
              </Section>
            )}

            {result.lineItems && result.lineItems.length > 0 && (
              <Section title={`Line items (${result.lineItems.length})`}>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-2 py-1 text-left">Name</th>
                        <th className="px-2 py-1 text-right">Qty</th>
                        <th className="px-2 py-1 text-right">Price</th>
                        <th className="px-2 py-1 text-left">SKU/EAN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.lineItems.map((item, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1">{item.name ?? '—'}</td>
                          <td className="px-2 py-1 text-right">{item.quantity ?? '—'}</td>
                          <td className="px-2 py-1 text-right">{item.unitPrice ?? '—'}</td>
                          <td className="px-2 py-1 font-mono text-xs">
                            {item.sku ?? item.ean ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {result.suggestedActions && result.suggestedActions.length > 0 && (
              <Section title="Suggested actions">
                <ul className="list-disc space-y-1 pl-5">
                  {result.suggestedActions.map((action, i) => (
                    <li key={i}>{action}</li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

function DefinitionList({ entries }: { entries: Record<string, unknown> }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
      {Object.entries(entries).map(([k, v]) =>
        v == null ? null : (
          <React.Fragment key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="wrap-break-word">{String(v)}</dd>
          </React.Fragment>
        ),
      )}
    </dl>
  );
}

