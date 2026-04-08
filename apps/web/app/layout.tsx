import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { QueryProvider } from '@/components/query-provider';

export const metadata: Metadata = {
  title: 'EDI Document Assistant',
  description: 'AI-Powered EDI Document Understanding with Multi-Provider Support',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <QueryProvider>
          <SiteHeader />
          <main className="container mx-auto px-4 py-8">{children}</main>
        </QueryProvider>
      </body>
    </html>
  );
}
