import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DocumentSummary } from '@/lib/types';

export function DocumentCard({ document }: { document: DocumentSummary }) {
  return (
    <Link href={`/documents/${document.code}`} className="block">
      <Card className="h-full transition-colors hover:bg-accent/50">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            {/* min-w-0 lets the flex item shrink below its content size,
                line-clamp-2 caps height at two lines, break-all breaks long
                filenames without spaces (e.g. dfiallo_BonpreuEs_..._Pedido.edi).
                The native title tooltip exposes the full name on hover. */}
            <CardTitle
              className="min-w-0 line-clamp-2 break-all text-base"
              title={document.filename}
            >
              {document.filename}
            </CardTitle>
            <Badge variant="secondary" className="shrink-0">
              {document.format.code.toUpperCase()}
            </Badge>
          </div>
          <CardDescription className="font-mono text-xs">{document.code}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {document.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{document.description}</p>
          )}
          {document.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {document.tags.slice(0, 4).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
