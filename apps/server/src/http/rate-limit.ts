import type { Context, MiddlewareHandler } from 'hono';

/**
 * Minimal in-memory fixed-window rate limiter. Suitable for a single instance
 * deployment. Sharded deployments should swap for a Redis variant.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function ipOf(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'anon'
  );
}

export function rateLimit(opts: {
  max: number;
  windowMs: number;
  keyer?: (c: Context) => string | Promise<string>;
  scope?: string;
}): MiddlewareHandler {
  const keyer = opts.keyer ?? ipOf;
  const scope = opts.scope ?? 'default';

  return async (c, next) => {
    const key = `${scope}:${await keyer(c)}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > opts.max) {
      const retry = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      c.header('Retry-After', String(retry));
      return c.json({ error: 'rate_limited', retry_after_seconds: retry }, 429);
    }
    return next();
  };
}

/**
 * Per-matricola counter, called from inside a handler after the form is
 * parsed (so we don't consume the body twice). Returns true if the request
 * should be allowed, false if it has exceeded the threshold.
 */
export function recordMatricolaAttempt(matricola: string, max = 3, windowMs = 60_000): boolean {
  const key = `matricola:${matricola.toLowerCase()}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= max;
}

/** Test helper. */
export function _resetRateLimitsForTests(): void {
  buckets.clear();
}
