import { describe, it, expect } from 'vitest';
import { cn, formatDate } from './utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('deduplicates conflicting Tailwind classes (last one wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('ignores falsy values', () => {
    const isActive = false;
    expect(cn('px-2', isActive && 'py-1', undefined, null)).toBe('px-2');
  });

  it('returns empty string when no arguments are given', () => {
    expect(cn()).toBe('');
  });
});

describe('formatDate', () => {
  it('formats a UTC ISO string as DD/MM/YYYY HH:mm:ss', () => {
    expect(formatDate('2026-04-08T14:05:03Z')).toBe('08/04/2026 14:05:03');
  });

  it('pads single-digit day and month', () => {
    expect(formatDate('2026-01-03T09:07:01Z')).toBe('03/01/2026 09:07:01');
  });

  it('accepts a Date object', () => {
    const d = new Date('2026-04-08T00:00:00Z');
    expect(formatDate(d)).toBe('08/04/2026 00:00:00');
  });

  it('is deterministic — same input always produces the same string', () => {
    const iso = '2026-04-08T12:30:00Z';
    expect(formatDate(iso)).toBe(formatDate(iso));
  });
});
