import type { Metadata } from 'next';

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
