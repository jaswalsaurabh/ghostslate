import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

const COOKIE_NAME = 'ghostslate_session';
const SESSION_PATTERN = /^[a-f0-9]{64}$/;
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

function readCookie(req: Request): string | undefined {
  const header = req.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, ...valueParts] = part.trim().split('=');
    if (name === COOKIE_NAME) {
      const value = valueParts.join('=');
      return SESSION_PATTERN.test(value) ? value : undefined;
    }
  }
  return undefined;
}

export function getOrSetAnonymousSession(req: Request, res: Response): string {
  const existing = readCookie(req);
  if (existing) return existing;

  const session = randomBytes(32).toString('hex');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${session}; Max-Age=${SESSION_MAX_AGE_SECONDS}; Path=/api; HttpOnly; SameSite=Lax${secure}`,
  );
  return session;
}
