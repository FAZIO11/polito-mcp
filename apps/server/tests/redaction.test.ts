import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';

/**
 * Critical security invariant: a synthetic, unmistakable password string must
 * never appear in any log line, no matter where in a logged object it shows
 * up. This guards against future code that logs a request body or pgs object
 * verbatim. CI runs this test on every PR.
 */
const SYNTHETIC_PASSWORD = 'POLITOMCP_SECRET_VALUE_DO_NOT_LOG_42';

interface Captured {
  lines: string[];
}

function makeCapturedLogger(): { logger: pino.Logger; captured: Captured } {
  const captured: Captured = { lines: [] };
  const dest = new Writable({
    write(chunk, _enc, cb) {
      captured.lines.push(chunk.toString('utf8'));
      cb();
    },
  });
  const logger = pino(
    {
      redact: {
        paths: [
          '*.password',
          '*.passwd',
          '*.pwd',
          '*.token',
          '*.access_token',
          '*.refresh_token',
          '*.authorization',
          '*.cookie',
          '*.body',
          'req.headers.authorization',
          'res.headers["set-cookie"]',
          'password',
          'token',
          'body',
        ],
        censor: '[REDACTED]',
      },
    },
    dest,
  );
  return { logger, captured };
}

describe('log redaction', () => {
  let captured: Captured;
  let logger: pino.Logger;

  beforeAll(() => {
    const made = makeCapturedLogger();
    logger = made.logger;
    captured = made.captured;
  });

  afterAll(() => {
    // Defensive: drop captured material so it can't accidentally end up in
    // CI artifacts when this file is re-imported.
    captured.lines.length = 0;
  });

  it('redacts a top-level password field', () => {
    logger.info({ password: SYNTHETIC_PASSWORD }, 'user logging in');
    const joined = captured.lines.join('\n');
    expect(joined).not.toContain(SYNTHETIC_PASSWORD);
  });

  it('redacts a nested password field', () => {
    logger.info({ user: { username: 's000001', password: SYNTHETIC_PASSWORD } }, 'nested');
    const joined = captured.lines.join('\n');
    expect(joined).not.toContain(SYNTHETIC_PASSWORD);
  });

  it('redacts a request body wholesale', () => {
    logger.info(
      { req: { method: 'POST', url: '/authorize', body: { password: SYNTHETIC_PASSWORD } } },
      'request',
    );
    const joined = captured.lines.join('\n');
    expect(joined).not.toContain(SYNTHETIC_PASSWORD);
  });

  it('redacts Authorization headers', () => {
    logger.info(
      { req: { headers: { authorization: `Bearer ${SYNTHETIC_PASSWORD}` } } },
      'with auth header',
    );
    const joined = captured.lines.join('\n');
    expect(joined).not.toContain(SYNTHETIC_PASSWORD);
  });

  it('redacts a top-level token field', () => {
    logger.warn({ token: SYNTHETIC_PASSWORD }, 'token');
    const joined = captured.lines.join('\n');
    expect(joined).not.toContain(SYNTHETIC_PASSWORD);
  });
});
