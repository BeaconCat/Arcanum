import type { Request, Response, NextFunction } from 'express';

// ── General rate limiter: 200 req / 60s per IP ──
const windowMs = 60 * 1000;
const maxRequests = 200;
const hits = new Map<string, { count: number; resetAt: number }>();

// ── Auth rate limiter: 15 req / 60s per IP (brute force protection) ──
const authWindowMs = 60 * 1000;
const authMaxRequests = 15;
const authHits = new Map<string, { count: number; resetAt: number }>();
const AUTH_PREFIXES = ['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/forgot-password', '/api/v1/auth/reset-password', '/api/v1/auth/refresh'];

// Bound memory usage from one-off source IPs.
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of hits) if (value.resetAt < now) hits.delete(key);
  for (const [key, value] of authHits) if (value.resetAt < now) authHits.delete(key);
}, 5 * 60 * 1000).unref();

function checkLimit(
  store: Map<string, { count: number; resetAt: number }>,
  key: string,
  window: number,
  max: number,
): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + window });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

export function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = req.ip || 'unknown';

  // Stricter limit for auth endpoints
  if (AUTH_PREFIXES.some((p) => req.path.startsWith(p))) {
    if (!checkLimit(authHits, key, authWindowMs, authMaxRequests)) {
      res.status(429).json({ success: false, error: '登录尝试过于频繁，请稍后再试' });
      return;
    }
    next();
    return;
  }

  // General limit
  if (!checkLimit(hits, key, windowMs, maxRequests)) {
    res.status(429).json({ success: false, error: '请求过于频繁，请稍后再试' });
    return;
  }

  next();
}
