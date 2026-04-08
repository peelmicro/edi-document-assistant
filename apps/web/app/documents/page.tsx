'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DocumentCard } from '@/components/document-card';
import { fetchDocuments, fetchFormats } from '@/lib/api';

const PAGE_SIZE = 12;
const ALL_FORMATS = '__all__';

/**
 * Document list page — Client Component.
 *
 * Filters: format dropdown, debounced search box, pagination.
 *
 * The query key includes every filter so navigating back uses the cache
 * and changing any filter triggers a refetch automatically.
 */
export default function DocumentsPage() {
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [formatCode, setFormatCode] = React.useState<string>(ALL_FORMATS);
  const [page, setPage] = React.useState(1);

  // Debounce the search box so we don't fire a request on every keystroke
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, formatCode]);

  const formatsQuery = useQuery({
    queryKey: ['formats'],
    queryFn: fetchFormats,
  });

  const documentsQuery = useQuery({
    queryKey: ['documents', { page, pageSize: PAGE_SIZE, formatCode, search: debouncedSearch }],
    queryFn: () =>
      fetchDocuments({
        page,
        pageSize: PAGE_SIZE,
        formatCode: formatCode === ALL_FORMATS ? undefined : formatCode,
        search: debouncedSearch || undefined,
      }),
  });

  const data = documentsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            All EDI documents stored in MinIO. Click any card to inspect, analyse, or chat.
          </p>
        </div>
        <Button asChild>
          <Link href="/upload">
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by filename, code, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={formatCode} onValueChange={setFormatCode}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All formats" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FORMATS}>All formats</SelectItem>
            {formatsQuery.data?.map((format) => (
              <SelectItem key={format.id} value={format.code}>
                {format.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {documentsQuery.isLoading && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Loading documents...
          </CardContent>
        </Card>
      )}

      {documentsQuery.isError && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Failed to load documents: {(documentsQuery.error as Error).message}
          </CardContent>
        </Card>
      )}

      {data && data.items.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No documents match your filters.
          </CardContent>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.items.map((doc) => (
              <DocumentCard key={doc.id} document={doc} />
            ))}
          </div>

          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              Showing {(data.page - 1) * data.pageSize + 1}–
              {Math.min(data.page * data.pageSize, data.total)} of {data.total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {data.page} of {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
