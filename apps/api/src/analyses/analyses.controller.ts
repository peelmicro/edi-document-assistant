import { Body, Controller, Get, Param, Post, Query, Req, Sse } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { AnalysesService } from './analyses.service';
import type { ProviderCode } from '../langchain/providers.factory';

interface AnalyzeBody {
  providerCode: ProviderCode;
  model: string;
  mode?: 'chain' | 'graph';
}

@Controller('documents/:code/analyses')
export class AnalysesController {
  constructor(private readonly analysesService: AnalysesService) {}

  @Get()
  async list(@Param('code') code: string) {
    return this.analysesService.findAllForDocument(code);
  }

  @Post()
  async analyze(@Param('code') code: string, @Body() body: AnalyzeBody) {
    return this.analysesService.analyze({
      documentCode: code,
      providerCode: body.providerCode,
      model: body.model,
      mode: body.mode,
    });
  }

  /**
   * Server-Sent Events endpoint that streams the analysis token by token.
   *
   * Uses GET (with provider/model as query params) because the browser's
   * native `EventSource` API only supports GET.
   *
   * Each yielded event from `streamAnalyze` becomes a `MessageEvent`. NestJS
   * serializes the `data` payload to JSON automatically. The `type` field
   * controls the SSE `event:` line so the client can route events with
   * `eventSource.addEventListener('token', ...)`.
   *
   * If the client closes the connection (tab close, browser back, etc.) the
   * Express `req.on('close')` listener fires our `AbortController` so the
   * in-flight LLM call is cancelled instead of burning tokens.
   */
  @Sse('stream')
  streamAnalyze(
    @Param('code') code: string,
    @Query('providerCode') providerCode: ProviderCode,
    @Query('model') model: string,
    @Req() req: Request,
  ): Observable<MessageEvent> {
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    const generator = this.analysesService.streamAnalyze(
      { documentCode: code, providerCode, model },
      abortController.signal,
    );

    return new Observable<MessageEvent>((subscriber) => {
      (async () => {
        try {
          for await (const event of generator) {
            subscriber.next({
              type: event.type,
              data: event,
            } as unknown as MessageEvent);
          }
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      })();

      // Cleanup if the subscriber unsubscribes for any reason
      return () => abortController.abort();
    });
  }
}
