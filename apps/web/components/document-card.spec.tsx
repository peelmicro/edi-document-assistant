import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentCard } from './document-card';
import type { DocumentSummary } from '@/lib/types';

// Next.js Link needs a router context in tests
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseDoc: DocumentSummary = {
  id: 'uuid-1',
  code: 'DOC-2026-04-000001',
  filename: 'purchase-order-carrefour.edi',
  description: 'EDIFACT D96A purchase order from Carrefour',
  tags: ['purchase order', 'carrefour', 'food', 'dairy'],
  storagePath: 'documents/uuid-1.edi',
  createdAt: '2026-04-01T10:00:00Z',
  updatedAt: '2026-04-01T10:00:00Z',
  format: { code: 'edifact', name: 'EDIFACT' },
};

describe('DocumentCard', () => {
  it('renders the filename', () => {
    render(<DocumentCard document={baseDoc} />);
    expect(screen.getByText('purchase-order-carrefour.edi')).toBeInTheDocument();
  });

  it('renders the document code', () => {
    render(<DocumentCard document={baseDoc} />);
    expect(screen.getByText('DOC-2026-04-000001')).toBeInTheDocument();
  });

  it('renders the format badge in uppercase', () => {
    render(<DocumentCard document={baseDoc} />);
    expect(screen.getByText('EDIFACT')).toBeInTheDocument();
  });

  it('renders the description when present', () => {
    render(<DocumentCard document={baseDoc} />);
    expect(
      screen.getByText('EDIFACT D96A purchase order from Carrefour'),
    ).toBeInTheDocument();
  });

  it('does not render a description element when description is absent', () => {
    render(<DocumentCard document={{ ...baseDoc, description: null }} />);
    expect(
      screen.queryByText('EDIFACT D96A purchase order from Carrefour'),
    ).not.toBeInTheDocument();
  });

  it('renders up to 4 tags', () => {
    render(<DocumentCard document={baseDoc} />);
    // All 4 tags should be visible
    ['purchase order', 'carrefour', 'food', 'dairy'].forEach((tag) => {
      expect(screen.getByText(tag)).toBeInTheDocument();
    });
  });

  it('shows no tags section when tags array is empty', () => {
    render(<DocumentCard document={{ ...baseDoc, tags: [] }} />);
    // None of the original tags should appear
    expect(screen.queryByText('purchase order')).not.toBeInTheDocument();
  });

  it('links to the document detail page', () => {
    render(<DocumentCard document={baseDoc} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/documents/DOC-2026-04-000001');
  });
});
