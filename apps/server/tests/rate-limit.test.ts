import { describe, expect, it, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  _resetRateLimitsForTests,
  rateLimit,
  recordMatricolaAttempt,
} from '../src/http/rate-limit.js';

describe('rate limiter', () => {
  beforeEach(() => _resetRateLimitsForTests());

  it('429s after the limit on the same IP', async () => {
    const app = new Hono();
    app.use('*', rateLimit({ max: 2, windowMs: 60_000, scope: 't1' }));
    app.get('/ping', (c) => c.text('ok'));

    const headers = { 'x-forwarded-for': '1.2.3.4' };
    const a = await app.request('/ping', { headers });
    const b = await app.request('/ping', { headers });
    const c = await app.request('/ping', { headers });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(c.status).toBe(429);
    expect(c.headers.get('retry-after')).toBeTruthy();
  });

  it('keeps separate buckets per IP', async () => {
    const app = new Hono();
    app.use('*', rateLimit({ max: 1, windowMs: 60_000, scope: 't2' }));
    app.get('/ping', (c) => c.text('ok'));

    const a = await app.request('/ping', { headers: { 'x-forwarded-for': '10.0.0.1' } });
    const b = await app.request('/ping', { headers: { 'x-forwarded-for': '10.0.0.2' } });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it('per-matricola counter respects the limit', () => {
    expect(recordMatricolaAttempt('s000001', 2)).toBe(true);
    expect(recordMatricolaAttempt('s000001', 2)).toBe(true);
    expect(recordMatricolaAttempt('s000001', 2)).toBe(false);
    expect(recordMatricolaAttempt('s000002', 2)).toBe(true);
  });
});
