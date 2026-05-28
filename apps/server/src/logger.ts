import pino from 'pino';
import { loadConfig } from './config.js';

/**
 * Centralised logger. The redaction rules are an *allow list by inversion*:
 * every field that could plausibly carry user secrets is blocked. The full
 * list of known-sensitive keys is below; CI also runs a redaction test that
 * POSTs a synthetic password and asserts it never appears in any log line.
 */
const SENSITIVE_PATHS = [
  // OAuth/JWT
  '*.password',
  '*.passwd',
  '*.pwd',
  '*.token',
  '*.access_token',
  '*.refresh_token',
  '*.id_token',
  '*.authorization',
  '*.cookie',
  '*.session',
  '*.set-cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  // PoliTO-specific
  '*.matricola',
  '*.username',
  '*.polito_token_ct',
  '*.politoToken',
  // generic body / query buckets
  '*.body',
  '*.query.password',
];

function getRootConfig() {
  try {
    return loadConfig();
  } catch {
    return null;
  }
}

const cfg = getRootConfig();
const isDev = cfg?.NODE_ENV !== 'production';

export const logger = pino({
  level: cfg?.LOG_LEVEL ?? 'info',
  redact: {
    paths: SENSITIVE_PATHS,
    censor: '[REDACTED]',
    remove: false,
  },
  transport: isDev
    ? {
        target: 'pino/file',
        options: { destination: 1 },
      }
    : undefined,
  base: { app: 'polito-mcp' },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
