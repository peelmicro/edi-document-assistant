import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * Logs every HTTP request at the framework level.
 *
 * Format: METHOD url → status (Xms)
 *
 * Wired in `app.module.ts` via `MiddlewareConsumer.apply(...).forRoutes('*')`.
 *
 * This means every endpoint — read-only, CRUD, AI-calling, SSE — shows up in
 * the logs without each controller having to remember to log itself. The
 * deeper service-level "Analysis started for ..." style logs still exist for
 * the AI-calling code paths so the user knows what's happening during the
 * 5-10 seconds an LLM call takes; this middleware just adds the bookend
 * request/response line for everything.
 */
@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const startedAt = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startedAt;
      const { statusCode } = res;
      this.logger.log(`${method} ${originalUrl} → ${statusCode} (${duration}ms)`);
    });

    next();
  }
}
