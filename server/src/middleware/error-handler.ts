import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { DomainError } from '../errors/domain-error.js';
import type { Logger } from 'pino';

export function createErrorHandler(
  logger: Logger,
): ErrorRequestHandler {
  return (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    if (err instanceof DomainError) {
      logger.warn({ err, errorCode: err.errorCode }, err.message);
      res.status(err.statusCode).json({
        error: {
          code: err.errorCode,
          message: err.message,
        },
      });
      return;
    }

    logger.error({ err }, 'Unhandled server error');
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected internal error occurred',
      },
    });
  };
}
