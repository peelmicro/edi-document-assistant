import Link from 'next/link';
import { ArrowRight, Upload, MessagesSquare, GitCompare, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentCard } from '@/components/document-card';
import { fetchDocuments } from '@/lib/api';

/**
 * Home page — Server Component.
 *
 * Server-side fetches the 4 most recent documents at request time, so the
 * card grid is part of the initial HTML (no client-side loading flicker).
 *
 * If the API is unreachable we still render the hero and the feature grid,
 * just with an empty docs section. This keeps the page useful when the
 * backend is down rather than crashing.
 */
export default async function HomePage() {
  let recentDocuments: Awaited<ReturnType<typeof fetchDocuments>>['items'] = [];
  let apiError: string | null = null;
  try {
    const list = await fetchDocuments({ pageSize: 4 });
    recentDocuments = list.items;
  } catch (error) {
    apiError = error instanceof Error ? error.message : 'Unknown error';
  }

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="space-y-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">EDI Document Assistant</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Upload EDI documents (EDIFACT, XML, JSON, CSV) and get instant human-readable
          explanations from Anthropic, OpenAI, or Google — switchable per request.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild>
            <Link href="/upload">
              <Upload className="mr-2 h-4 w-4" />
              Upload a document
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/documents">
              Browse documents
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Recent documents */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Recent documents</h2>
            <p className="text-sm text-muted-foreground">
              Pre-seeded samples plus anything you've uploaded.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/documents">
              View all
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {apiError && (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              <strong>Couldn't reach the API:</strong> {apiError}. Make sure the API is running on{' '}
              <code className="font-mono text-xs">http://localhost:3001</code>.
            </CardContent>
          </Card>
        )}

        {!apiError && recentDocuments.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No documents yet. <Link href="/upload" className="underline">Upload one</Link> to get
              started.
            </CardContent>
          </Card>
        )}

        {recentDocuments.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recentDocuments.map((doc) => (
              <DocumentCard key={doc.id} document={doc} />
            ))}
          </div>
        )}
      </section>

      {/* Feature highlights */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">What you can do</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            icon={<Upload className="h-5 w-5" />}
            title="Multi-format upload"
            description="EDIFACT, XML, JSON, and CSV documents stored in MinIO."
          />
          <FeatureCard
            icon={<Workflow className="h-5 w-5" />}
            title="LangGraph workflow"
            description="Multi-step parse → classify → explain → suggest agent."
          />
          <FeatureCard
            icon={<MessagesSquare className="h-5 w-5" />}
            title="Streaming chat"
            description="Ask follow-up questions with conversation history."
          />
          <FeatureCard
            icon={<GitCompare className="h-5 w-5" />}
            title="Cross-provider comparison"
            description="See how Anthropic, OpenAI, and Google extract differently."
          />
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardContent>
    </Card>
  );
}
