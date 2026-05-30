import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { verifyAccessToken, ACCESS_TOKEN_TTL_SECONDS } from '../auth/jwt.js';
import { findUserById } from '../db/users.js';
import { createPendingSession, linkSessionToUser, lookupSessionUserId, lookupIpUserId } from '../db/sessions.js';
import { logger } from '../logger.js';
import type { AppEnv } from '../http/context.js';
import { registerTools } from './tools.js';

interface SessionEntry {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
}

// In-memory session store. Added on creation, removed on transport close.
// Single-instance deployment only — multi-instance would need Redis or similar.
const mcpSessions = new Map<string, SessionEntry>();

async function resolveAuth(
  authHeader: string,
  sessionId: string | null,
  clientIp: string | null = null,
): Promise<AuthInfo> {
  let userId: string | null = null;
  let clientId = 'session';
  let username = '';
  let tokenScopes: string[] = [];

  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (bearer) {
    try {
      const claims = await verifyAccessToken(bearer);
      const user = findUserById(claims.sub);
      if (user) {
        userId = claims.sub;
        clientId = claims.client_id;
        username = user.polito_username;
        tokenScopes = claims.scope.split(/\s+/).filter(Boolean);
        // Keep session in sync so expired JWTs fall back to session auth.
        if (sessionId) linkSessionToUser(sessionId, userId);
      }
    } catch (err) {
      logger.info({ err }, 'JWT verification failed; falling back to session auth');
    }
  }

  if (!userId && sessionId) {
    userId = lookupSessionUserId(sessionId);
    if (userId) {
      const user = findUserById(userId);
      username = user?.polito_username ?? '';
      tokenScopes = ['student'];
    }
  }

  // Last resort: IP-based auth. After a successful /connect login the user's
  // IP is stored for 30 days so new sessions from the same device are
  // auto-authenticated even when the client reconnects with a fresh session ID.
  if (!userId && clientIp) {
    userId = lookupIpUserId(clientIp);
    if (userId) {
      const user = findUserById(userId);
      username = user?.polito_username ?? '';
      tokenScopes = ['student'];
      // Bind this new session to the user so session-based auth also works.
      if (sessionId) linkSessionToUser(sessionId, userId);
    }
  }

  return {
    token: bearer || sessionId || 'anon',
    clientId,
    scopes: tokenScopes,
    ...(bearer ? { expiresAt: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS } : {}),
    extra: { userId, sessionId, username, clientId },
  };
}

export function createMcpHttpApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use(
    '/mcp',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'mcp-session-id'],
      exposeHeaders: ['mcp-session-id'],
    }),
  );

  app.all('/mcp', async (c) => {
    const incomingSessionId = c.req.header('mcp-session-id') ?? null;
    const authHeader = c.req.header('authorization') ?? '';

    const clientIp =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      null;

    // ---- Route to existing session ----
    if (incomingSessionId) {
      const entry = mcpSessions.get(incomingSessionId);
      if (!entry) {
        // Session existed on a previous server instance or was evicted.
        // Return 404 so the client re-initialises with a fresh session.
        return new Response(
          JSON.stringify({ error: 'session_not_found', error_description: 'Session expired or server restarted. Please reconnect.' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const authInfo = await resolveAuth(authHeader, incomingSessionId, clientIp);
      return entry.transport.handleRequest(c.req.raw, { authInfo });
    }

    // ---- New session ----
    // Pre-generate the session ID so we can include it in authInfo.extra
    // before handleRequest is called (tools need it to build the /connect URL).
    const newSessionId = randomUUID();
    createPendingSession(newSessionId);

    const authInfo = await resolveAuth(authHeader, newSessionId, clientIp);

    const mcpServer = new McpServer(
      { name: 'polito-mcp', version: '0.1.0' },
      {
        capabilities: { tools: { listChanged: false } },
        instructions:
          'You can read the authenticated PoliTO student profile, grades, deadlines, courses and lectures, plus accept/reject provisional grades and mark messages as read. Always confirm with the user before calling a destructive tool.',
      },
    );
    registerTools(mcpServer);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      enableJsonResponse: true,
    });

    transport.onclose = () => {
      mcpSessions.delete(newSessionId);
      logger.info({ sessionId: newSessionId }, 'MCP session closed');
    };

    await mcpServer.connect(transport);
    mcpSessions.set(newSessionId, { transport, server: mcpServer });

    try {
      return await transport.handleRequest(c.req.raw, { authInfo });
    } catch (err) {
      mcpSessions.delete(newSessionId);
      throw err;
    }
  });

  return app;
}
