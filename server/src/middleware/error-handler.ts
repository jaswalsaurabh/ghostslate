import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { DomainError, PayloadTooLargeError, ValidationError } from '../errors/domain-error.js';
import type { Logger } from 'pino';

function normalizeRequestError(err: unknown): unknown {
  if (!err || typeof err !== 'object') return err;

  const requestError = err as { type?: unknown; status?: unknown };
  if (requestError.type === 'entity.too.large' || requestError.status === 413) {
    return new PayloadTooLargeError('Request body exceeds the 16 KB limit');
  }
  if (requestError.type === 'entity.parse.failed') {
    return new ValidationError('Request body must contain valid JSON');
  }
  return err;
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    const normalizedError = normalizeRequestError(err);

    if (normalizedError instanceof DomainError) {
      logger.warn(
        { err: normalizedError, errorCode: normalizedError.errorCode },
        normalizedError.message,
      );
      res.status(normalizedError.statusCode).json({
        error: {
          code: normalizedError.errorCode,
          message: normalizedError.message,
        },
      });
      return;
    }

    logger.error({ err: normalizedError }, 'Unhandled server error');
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected internal error occurred',
      },
    });
  };
}
