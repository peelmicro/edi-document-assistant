'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wraps the app with a TanStack Query client.
 *
 * Created lazily inside `useState` so the same client instance survives
 * re-renders but is unique per browser session (avoids the SSR pitfall
 * where a singleton on the server leaks state between requests).
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // AI calls are slow and the data doesn't change much — so we
            // err toward keeping fetched data around longer than the
            // default 0ms.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
