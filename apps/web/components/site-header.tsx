import Link from 'next/link';
import { FileText } from 'lucide-react';

/**
 * Top navigation header. Server Component — no interactivity needed.
 *
 * Routes:
 *   /              — home (recent docs + CTA)
 *   /documents     — full document list
 *   /upload        — multipart upload form
 *   /providers     — provider/model browser (read-only)
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <FileText className="h-5 w-5" />
          EDI Document Assistant
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/documents"
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Documents
          </Link>
          <Link
            href="/upload"
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Upload
          </Link>
          <Link
            href="/providers"
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Providers
          </Link>
        </nav>
      </div>
    </header>
  );
}
