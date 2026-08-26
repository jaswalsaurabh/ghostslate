import type { RequestHandler } from 'express';
import { RateLimitError } from '../errors/domain-error.js';

interface RateLimitOptions {
  name: string;
  maxRequests: number;
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const MAX_TRACKED_CLIENTS = 10_000;

export function createRateLimit(options: RateLimitOptions): RequestHandler {
  const entries = new Map<string, RateLimitEntry>();
  let requestsUntilSweep = 500;

  return (req, res, next) => {
    const now = Date.now();
    const key = `${options.name}:${req.ip}`;
    const existing = entries.get(key);
    if (!existing && entries.size >= MAX_TRACKED_CLIENTS) {
      res.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1_000)));
      next(new RateLimitError('Request capacity is temporarily exhausted'));
      return;
    }
    const entry =
      existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + options.windowMs };

    entry.count += 1;
    entries.set(key, entry);

    const remaining = Math.max(0, options.maxRequests - entry.count);
    const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('RateLimit-Limit', String(options.maxRequests));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    requestsUntilSweep -= 1;
    if (requestsUntilSweep === 0) {
      for (const [entryKey, candidate] of entries) {
        if (candidate.resetAt <= now) entries.delete(entryKey);
      }
      requestsUntilSweep = 500;
    }

    if (entry.count > options.maxRequests) {
      res.setHeader('Retry-After', String(resetSeconds));
      next(new RateLimitError('Too many requests; retry after the indicated interval'));
      return;
    }

    next();
  };
}
