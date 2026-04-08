'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trash2, FileText, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnalysisResultCard } from '@/components/analysis-result';
import { RunAnalysisDialog } from '@/components/run-analysis-dialog';
import { ChatPanel } from '@/components/chat-panel';
import { fetchDocument, deleteDocument } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { formatRawContent } from '@/lib/format-raw-content';
import type { DocumentDetail } from '@/lib/types';

interface DocumentDetailClientProps {
  initialDocument: DocumentDetail;
  initialContent: string;
}

/**
 * Client wrapper for the document detail page.
 *
 * The Server Component fetches the initial document and raw content
 * server-side; this wrapper takes over for the interactive bits:
 *   - Re-fetching the document via TanStack Query when an analysis runs
 *   - The "+Analyze" dialog
 *   - The chat panel (lazily mounted under each analysis card)
 *   - Document deletion
 *
 * `initialDocument` and `initialContent` are passed in as TanStack Query
 * `initialData` so the user sees something instantly while the client
 * cache hydrates.
 */
export function DocumentDetailClient({
  initialDocument,
  initialContent,
}: DocumentDetailClientProps) {
  const router = useRouter();
  const [activeAnalysisId, setActiveAnalysisId] = React.useState<string | null>(
    initialDocument.analyses[0]?.id ?? null,
  );

  const documentQuery = useQuery({
    queryKey: ['document', initialDocument.code],
    queryFn: () => fetchDocument(initialDocument.code),
    initialData: initialDocument,
  });

  const document = documentQuery.data;

  const handleDelete = async () => {
    if (!confirm(`Delete ${document.code}? This removes the file from MinIO.`)) return;
    await deleteDocument(document.code);
    router.push('/documents');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{document.filename}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{document.code}</span>
            <span>•</span>
            <Badge variant="secondary">{document.format.code.toUpperCase()}</Badge>
            <span>•</span>
            <span>{formatDate(document.createdAt)}</span>
          </div>
          {document.description && (
            <p className="text-sm text-muted-foreground">{document.description}</p>
          )}
          {document.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {document.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <RunAnalysisDialog documentCode={document.code} />
          <Button asChild variant="outline">
            <Link href={`/documents/${document.code}/compare`}>
              <GitCompare className="mr-2 h-4 w-4" />
              Compare
            </Link>
          </Button>
          <Button variant="outline" size="icon" onClick={handleDelete} title="Delete document">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Two-column layout: raw content on the left, analyses + chat on the right */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        {/* Raw content viewer */}
        <Card className="lg:sticky lg:top-20 lg:self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Raw content
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
              {formatRawContent(initialContent, document.format.code)}
            </pre>
          </CardContent>
        </Card>

        {/* Analyses + chat */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Analyses ({document.analyses.length})
          </h2>

          {document.analyses.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No analyses yet. Click "Run new analysis" to create the first one.
              </CardContent>
            </Card>
          )}

          {document.analyses.map((analysis) => {
            const isActive = analysis.id === activeAnalysisId;
            return (
              <div key={analysis.id} className="space-y-2">
                <div onClick={() => setActiveAnalysisId(analysis.id)} className="cursor-pointer">
                  <AnalysisResultCard analysis={analysis} />
                </div>
                {isActive && analysis.process.status === 'completed' && (
                  <ChatPanel
                    documentCode={document.code}
                    parentProcessId={analysis.processId}
                    initialMessages={document.messages.filter(
                      (m) => m.parentProcessId === analysis.processId,
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
