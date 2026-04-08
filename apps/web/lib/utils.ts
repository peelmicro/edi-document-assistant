import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combine Tailwind class names with intelligent deduping.
 *
 * Used by every shadcn component. Lets callers do:
 *   cn('px-2 py-1', isActive && 'bg-primary')
 * and get a clean, conflict-free result.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats an ISO date string for display in the UI.
 *
 * Uses a **deterministic, locale-independent** format (`DD/MM/YYYY HH:mm:ss`)
 * so the server and the client always produce the same string. Without
 * this, calling `new Date(...).toLocaleString()` directly causes Next.js
 * hydration mismatches because the server's default locale (e.g. en-GB)
 * doesn't match the user's browser locale (e.g. en-US).
 */
export function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
