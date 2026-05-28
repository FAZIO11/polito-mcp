import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { Hono } from 'hono';
import { verifyAccessToken, ACCESS_TOKEN_TTL_SECONDS } from '../auth/jwt.js';
import { findUserById } from '../db/users.js';
import { createPendingSession, linkSessionToUser, lookupSessionUserId } from '../db/sessions.js';
import { logger } from '../logger.js';
import type { AppEnv } from '../http/context.js';
import { registerTools } from './tools.js';

export function createMcpHttpApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.all('/mcp', async (c) => {
    // ---- Resolve session ID ----
    // On the first request the client has no session ID; we generate one,
    // store it as a pending session, and echo it back in the response header.
    // The MCP client will include it on every subsequent request so we can
    // correlate tool calls with the logged-in user.
    let sessionId = c.req.header('mcp-session-id') ?? null;
    if (!sessionId) {
      sessionId = randomUUID();
      createPendingSession(sessionId);
    }

    // ---- Resolve userId (JWT first for backward compat, session fallback) ----
    let userId: string | null = null;
    let clientId = 'session';
    let username = '';
    let tokenScopes: string[] = [];

    const authHeader = c.req.header('authorization') ?? '';
    const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

    if (bearer) {
      try {
        const claims = await verifyAccessToken(bearer);
        const user = findUserById(claims.sub);
        if (user) {
          userId = claims.sub;
          clientId = claims.client_id;
          username = user.polito_username;
          tokenScopes = claims.scope.split(/\s+/).filter(Boolean);
          // Keep session in sync so that even if JWT expires, session auth works.
          linkSessionToUser(sessionId, userId);
        }
      } catch (err) {
        logger.info({ err }, 'JWT verification failed; falling back to session auth');
      }
    }

    if (!userId) {
      userId = lookupSessionUserId(sessionId);
      if (userId) {
        const user = findUserById(userId);
        username = user?.polito_username ?? '';
        tokenScopes = ['student'];
      }
    }

    // ---- Build authInfo — userId may be null for unauthenticated sessions ----
    const authInfo: AuthInfo = {
      token: bearer || sessionId,
      clientId,
      scopes: tokenScopes,
      ...(bearer ? { expiresAt: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS } : {}),
      extra: {
        userId,       // null → tool handlers return the /connect login URL
        sessionId,
        username,
        clientId,
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
      const response = await transport.handleRequest(c.req.raw, { authInfo });
      // Always echo session ID so the client can store it from the first response.
      const headers = new Headers(response.headers);
      headers.set('mcp-session-id', sessionId);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } finally {
      transport.close().catch(() => {});
    }
  });

  return app;
}
