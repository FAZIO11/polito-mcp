import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { Hono } from 'hono';
import { verifyAccessToken, ACCESS_TOKEN_TTL_SECONDS } from '../auth/jwt.js';
import { findUserById, getDecryptedToken } from '../db/users.js';
import { logger } from '../logger.js';
import type { AppEnv } from '../http/context.js';
import { registerTools } from './tools.js';

/**
 * Builds the MCP server instance and mounts it on `/mcp` of the returned Hono
 * sub-app. The transport runs in stateless mode (one MCP server per request),
 * which is the simplest pattern for a fully hosted server with stateless JWT
 * auth. If we later want streaming/notifications between requests we can
 * switch on session ids.
 */
export function createMcpHttpApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.all('/mcp', async (c) => {
    // ---- Authenticate ----
    const authHeader = c.req.header('authorization') ?? '';
    const bearer = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!bearer) {
      return new Response(
        JSON.stringify({ error: 'unauthorized', error_description: 'Missing bearer token.' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': `Bearer realm="polito-mcp", resource="${c.req.url}"`,
          },
        },
      );
    }
    let claims;
    try {
      claims = await verifyAccessToken(bearer);
    } catch (err) {
      logger.info({ err }, 'JWT verification failed');
      return new Response(
        JSON.stringify({ error: 'invalid_token' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer error="invalid_token"',
          },
        },
      );
    }

    const user = findUserById(claims.sub);
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'invalid_token', error_description: 'User deleted.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const stored = getDecryptedToken(claims.sub);
    if (!stored) {
      return new Response(
        JSON.stringify({
          error: 'invalid_token',
          error_description: 'Upstream PoliTO session expired; please re-authorize.',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer error="invalid_token"',
          },
        },
      );
    }

    const authInfo: AuthInfo = {
      token: bearer,
      clientId: claims.client_id,
      scopes: claims.scope.split(/\s+/).filter(Boolean),
      expiresAt: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
      extra: {
        userId: claims.sub,
        username: claims.username,
        clientId: claims.client_id,
      },
    };

    // ---- Build a fresh MCP server + transport per request (stateless). ----
    const server = new McpServer(
      { name: 'polito-mcp', version: '0.1.0' },
      {
        capabilities: { tools: { listChanged: false } },
        instructions:
          'You can read the authenticated PoliTO student profile, grades, deadlines, courses and lectures, plus accept/reject provisional grades and mark messages as read. Always confirm with the user before calling a destructive tool.',
      },
    );
    registerTools(server);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw, { authInfo });
    } finally {
      // Best-effort cleanup; ignore close errors.
      transport.close().catch(() => {});
    }
  });

  return app;
}
