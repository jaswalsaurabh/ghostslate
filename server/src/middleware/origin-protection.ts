import type { Request, RequestHandler } from 'express';
import { ForbiddenError, UnsupportedMediaTypeError } from '../errors/domain-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function configuredOrigins(): Map<string, string> {
  return new Map(
    (process.env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin && isValidWebOrigin(origin))
      .map((origin) => [origin, origin]),
  );
}

function requestOrigin(req: Request): string {
  return `${req.protocol}://${req.get('host') ?? ''}`;
}

function isValidWebOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === origin
    );
  } catch {
    return false;
  }
}

export function createOriginProtection(): RequestHandler {
  const allowlist = configuredOrigins();

  return (req, res, next) => {
    const origin = req.get('origin');
    const fetchSite = req.get('sec-fetch-site');

    if (fetchSite === 'cross-site' && (!origin || !allowlist.has(origin))) {
      next(new ForbiddenError('Cross-site requests are not allowed'));
      return;
    }

    if (origin) {
      const sameOrigin = requestOrigin(req);
      const allowedOrigin = origin === sameOrigin ? sameOrigin : allowlist.get(origin);
      if (!isValidWebOrigin(origin) || !allowedOrigin) {
        next(new ForbiddenError('Request origin is not allowed'));
        return;
      }

      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '600');
      res.vary('Origin');
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    if (!SAFE_METHODS.has(req.method) && !req.is('application/json')) {
      next(new UnsupportedMediaTypeError('Unsafe API requests must use application/json'));
      return;
    }

    next();
  };
}
