'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { askMessage, fetchMessages, fetchProviders } from '@/lib/api';
import type { Message, ProviderCode } from '@/lib/types';

interface ChatPanelProps {
  documentCode: string;
  parentProcessId: string;
  initialMessages: Message[];
}

/**
 * Chat panel for follow-up questions about a specific analysis.
 *
 * Uses TanStack Query to keep the message thread cached, and a mutation
 * to post new questions. After a successful POST the cache is updated
 * imperatively (via `setQueryData`) so the new pair appears instantly,
 * then a background refetch reconciles with the server.
 */
export function ChatPanel({ documentCode, parentProcessId, initialMessages }: ChatPanelProps) {
  const queryClient = useQueryClient();
  const [question, setQuestion] = React.useState('');
  const [providerCode, setProviderCode] = React.useState<ProviderCode>('anthropic');
  const [model, setModel] = React.useState<string>('claude-haiku-4-5-20251001');

  const providersQuery = useQuery({
    queryKey: ['ai-providers'],
    queryFn: fetchProviders,
  });

  const messagesQuery = useQuery({
    queryKey: ['messages', documentCode, parentProcessId],
    queryFn: () => fetchMessages(documentCode, parentProcessId),
    initialData: initialMessages,
  });

  const askMutation = useMutation({
    mutationFn: () =>
      askMessage(documentCode, {
        parentProcessId,
        providerCode,
        model,
        question: question.trim(),
      }),
    onSuccess: () => {
      setQuestion('');
      queryClient.invalidateQueries({ queryKey: ['messages', documentCode, parentProcessId] });
      // Also invalidate the document so the embedded messages list refreshes
      queryClient.invalidateQueries({ queryKey: ['document', documentCode] });
    },
  });

  const messages = messagesQuery.data ?? [];
  const selectedProvider = providersQuery.data?.find((p) => p.code === providerCode);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || askMutation.isPending) return;
    askMutation.mutate();
  };

  return (
    <Card className="border-l-4 border-l-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessagesSquare className="h-4 w-4" />
          Follow-up chat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {messages.length > 0 && (
          <div className="space-y-3">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </div>
        )}

        <form onSubmit={handleSend} className="space-y-2">
          <Textarea
            placeholder="Ask a follow-up question about this analysis..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={askMutation.isPending}
            rows={2}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={providerCode}
              onValueChange={(v) => {
                const code = v as ProviderCode;
                setProviderCode(code);
                const provider = providersQuery.data?.find((p) => p.code === code);
                if (provider?.models[0]) setModel(provider.models[0]);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providersQuery.data?.map((p) => (
                  <SelectItem key={p.id} value={p.code}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selectedProvider?.models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="submit"
              size="sm"
              disabled={!question.trim() || askMutation.isPending}
              className="ml-auto"
            >
              <Send className="mr-1 h-4 w-4" />
              {askMutation.isPending ? 'Asking...' : 'Ask'}
            </Button>
          </div>
          {askMutation.isError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
              {(askMutation.error as Error).message}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const text = message.process.response ?? message.process.errorMessage ?? '(empty)';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        <div className="mb-1 text-xs opacity-70">
          {isUser ? 'You' : message.process.aiProvider.name}
        </div>
        <div className="whitespace-pre-wrap">{text}</div>
      </div>
    </div>
  );
}
