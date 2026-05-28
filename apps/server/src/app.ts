import { Hono } from 'hono';
import { createAuthServer } from './auth/server.js';
import { createMcpHttpApp } from './mcp/server.js';
import { createAccountApp } from './http/account.js';
import { createConnectApp } from './http/connect.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import type { AppEnv } from './http/context.js';

/**
 * Builds the composite Hono application. Returned without binding to a port
 * so it can be tested directly via `app.request(...)`.
 */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Request logger + security headers.
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    logger.info(
      { method: c.req.method, path: new URL(c.req.url).pathname, status: c.res.status, ms },
      'request',
    );
    if (loadConfig().NODE_ENV === 'production') {
      c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
  });

  app.get('/', (c) => {
    return c.json({
      name: 'polito-mcp',
      message:
        'Unofficial MCP server for the Politecnico di Torino student API. See /.well-known/oauth-authorization-server for OAuth metadata and POST to /mcp with a Bearer access token.',
      docs: 'https://github.com/FAZIO11/polito-mcp',
    });
  });

  app.get('/healthz', (c) => c.text('ok'));

  app.route('/', createAuthServer());
  app.route('/', createAccountApp());
  app.route('/', createConnectApp());
  app.route('/', createMcpHttpApp());

  return app;
}
