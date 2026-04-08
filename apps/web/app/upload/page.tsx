'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload as UploadIcon, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { uploadDocument } from '@/lib/api';
import type { DocumentDetail } from '@/lib/types';

const ACCEPTED_EXTENSIONS = '.edi,.edifact,.xml,.json,.csv';

export default function UploadPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [file, setFile] = React.useState<File | null>(null);
  const [description, setDescription] = React.useState('');
  const [tags, setTags] = React.useState('');

  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Select a file first');
      return uploadDocument(file, { description, tags });
    },
    onSuccess: (doc: DocumentDetail) => {
      // The list query is keyed on filters; invalidating the prefix
      // covers all current filter combinations
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      router.push(`/documents/${doc.code}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload a document</h1>
        <p className="text-sm text-muted-foreground">
          Supported formats: EDIFACT (.edi), XML, JSON, CSV. The format is auto-detected from
          the filename extension.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Document details</CardTitle>
          <CardDescription>
            The file is uploaded to MinIO and indexed in PostgreSQL with an
            auto-generated DOC code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file">File</Label>
              <Input
                id="file"
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
              {file && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="What is this document about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (optional)</Label>
              <Input
                id="tags"
                placeholder="comma, separated, tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Tags help with filtering and search later.
              </p>
            </div>

            {mutation.isError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                Upload failed: {(mutation.error as Error).message}
              </div>
            )}

            <Button type="submit" disabled={!file || mutation.isPending} className="w-full">
              <UploadIcon className="mr-2 h-4 w-4" />
              {mutation.isPending ? 'Uploading...' : 'Upload document'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
