/**
 * Optional Sentry initialisation. We import lazily so the package is not a
 * hard dependency; if SENTRY_DSN is empty Sentry is never loaded.
 *
 * Body redaction is enforced by `beforeSend` and `beforeBreadcrumb` filters.
 * Even if Sentry's defaults change in the future, request bodies will be
 * stripped before transmission.
 */
import { logger } from '../logger.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'pwd',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'authorization',
  'cookie',
  'set-cookie',
  'session',
  'matricola',
  'username',
  'polito_token_ct',
]);

function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Sentry is an optional runtime dependency. We use a runtime dynamic import
 * whose specifier is constructed via a Function call so TypeScript does not
 * try to resolve the package types at build time. If `@sentry/node` is not
 * installed at runtime, init() is a no-op.
 */
type SentryEvent = {
  request?: { data?: unknown; cookies?: unknown; headers?: Record<string, string> };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
};
type SentryBreadcrumb = { data?: Record<string, unknown> };

export async function initSentry(dsn: string | undefined): Promise<void> {
  if (!dsn) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const dynImport = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>;
    const Sentry = (await dynImport('@sentry/node').catch(() => null)) as {
      init: (opts: Record<string, unknown>) => void;
    } | null;
    if (!Sentry) {
      logger.info('SENTRY_DSN set but @sentry/node not installed; skipping');
      return;
    }
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend(event: SentryEvent) {
        if (event.request) {
          event.request.data = '[REDACTED]';
          event.request.cookies = undefined;
          if (event.request.headers) {
            event.request.headers = redactDeep(event.request.headers) as Record<string, string>;
          }
        }
        if (event.extra) event.extra = redactDeep(event.extra) as Record<string, unknown>;
        if (event.contexts) event.contexts = redactDeep(event.contexts) as Record<string, unknown>;
        return event;
      },
      beforeBreadcrumb(crumb: SentryBreadcrumb) {
        if (crumb.data) crumb.data = redactDeep(crumb.data) as Record<string, unknown>;
        return crumb;
      },
    });
    logger.info('Sentry initialised');
  } catch (err) {
    logger.warn({ err }, 'Failed to initialise Sentry; continuing without it');
  }
}
