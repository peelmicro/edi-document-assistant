import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { DocumentDetailClient } from '@/components/document-detail-client';
import { fetchDocument, fetchDocumentContent } from '@/lib/api';

interface DocumentPageProps {
  params: Promise<{ code: string }>;
}

/**
 * Document detail page — Server Component.
 *
 * Server-side fetches the document and the raw file content in parallel,
 * then hands off to the Client wrapper for interactive bits.
 *
 * If the document doesn't exist, calls Next's `notFound()` so the user
 * gets a proper 404 instead of a runtime error.
 */
export default async function DocumentPage({ params }: DocumentPageProps) {
  const { code } = await params;

  let document;
  let content = '';
  try {
    [document, content] = await Promise.all([
      fetchDocument(code),
      fetchDocumentContent(code).catch(() => '(could not load raw content)'),
    ]);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/documents">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to documents
        </Link>
      </Button>
      <DocumentDetailClient initialDocument={document} initialContent={content} />
    </div>
  );
}
