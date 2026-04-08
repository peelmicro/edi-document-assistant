import Link from 'next/link';
import { ExternalLink, KeyRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchProviders } from '@/lib/api';

/**
 * Providers page — Server Component, read-only.
 *
 * The plan originally said "configure API keys, see usage stats". Both
 * are intentionally read-only here:
 *   - **API keys** live in `.env`. Persisting keys via the UI would mean
 *     storing secrets in the database which is a security trade-off the
 *     assessment didn't ask for.
 *   - **Usage stats** are already shown by LangSmith with token counts,
 *     latencies, and per-call cost. We just link out to the dashboard
 *     instead of duplicating that data.
 */
export default async function ProvidersPage() {
  let providers: Awaited<ReturnType<typeof fetchProviders>> = [];
  let apiError: string | null = null;
  try {
    providers = await fetchProviders();
  } catch (error) {
    apiError = error instanceof Error ? error.message : 'Unknown error';
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI providers</h1>
        <p className="text-sm text-muted-foreground">
          The providers and models registered with the API.
        </p>
      </div>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-amber-600" />
            API keys live in <code className="rounded bg-muted px-1 text-xs">.env</code>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            For security reasons API keys are not configurable through the UI. Set
            <code className="ml-1 rounded bg-muted px-1 text-xs">ANTHROPIC_API_KEY</code>,{' '}
            <code className="rounded bg-muted px-1 text-xs">OPENAI_API_KEY</code>, and{' '}
            <code className="rounded bg-muted px-1 text-xs">GOOGLE_API_KEY</code> in the project's
            root <code className="rounded bg-muted px-1 text-xs">.env</code> file and restart the
            API.
          </p>
          <p>
            Usage stats (token counts, cost, latency per call) are shown by LangSmith. Every chain,
            stream, and graph run is traced automatically.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link
              href="https://smith.langchain.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open LangSmith dashboard
              <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {apiError && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Failed to load providers: {apiError}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => (
          <Card key={provider.id}>
            <CardHeader>
              <CardTitle>{provider.name}</CardTitle>
              <CardDescription className="font-mono text-xs">{provider.code}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Models ({provider.models.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {provider.models.map((model) => (
                    <Badge key={model} variant="secondary" className="font-mono text-xs">
                      {model}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
