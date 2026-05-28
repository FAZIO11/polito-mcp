import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { initSentry } from './observability/sentry.js';

const cfg = loadConfig();
await initSentry(cfg.SENTRY_DSN);
const app = createApp();

const server = serve({ fetch: app.fetch, port: cfg.PORT, hostname: '0.0.0.0' }, (info) => {
  logger.info(
    { port: info.port, origin: cfg.PUBLIC_ORIGIN, env: cfg.NODE_ENV },
    'polito-mcp server listening',
  );
});

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
