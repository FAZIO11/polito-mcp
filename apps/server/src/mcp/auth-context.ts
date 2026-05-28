import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { loadConfig } from '../config.js';
import { logger } from '../logger.js';
import { getDecryptedToken, markTokenRevoked, touchLastSeen } from '../db/users.js';
import { PolitoApiError, PolitoClient } from '../polito/client.js';

/**
 * Pulled into MCP tool callbacks via RequestHandlerExtra.authInfo.extra. Set
 * by the auth middleware that wraps the MCP HTTP handler.
 */
export interface PolitoAuthExtra {
  userId: string;
  username: string;
  clientId: string;
}

/**
 * `RequestHandlerExtra` is generic on transport-specific request/notification
 * types. Tool callbacks only need `authInfo`, so we narrow to a structural
 * type to avoid bleeding SDK internals into our handlers.
 */
export interface HasAuthInfo {
  authInfo?: AuthInfo;
}

export function getPolitoAuthExtra(extra: HasAuthInfo): PolitoAuthExtra {
  const authInfo = extra.authInfo;
  const e = authInfo?.extra as Partial<PolitoAuthExtra> | undefined;
  if (!authInfo || !e?.userId || !e?.username) {
    throw new ToolAuthError('not_authenticated');
  }
  return {
    userId: e.userId,
    username: e.username,
    clientId: e.clientId ?? authInfo.clientId,
  };
}

/** Build a PolitoClient for the current tool call, lazily loading the bearer. */
export function clientForUser(userId: string): PolitoClient {
  const cfg = loadConfig();
  const token = getDecryptedToken(userId);
  if (!token) throw new ToolAuthError('no_active_token');
  touchLastSeen(userId);
  return new PolitoClient(cfg.POLITO_BASE_URL, token);
}

/**
 * Standard tool error wrapper: maps PolitoApiError to a structured tool reply
 * so the LLM can recover; specifically a 401 triggers token-revocation in our
 * DB so the next request will receive `re_auth_required`.
 */
export async function withPoliTo<T>(
  userId: string,
  fn: (client: PolitoClient) => Promise<T>,
): Promise<T> {
  const client = clientForUser(userId);
  try {
    return await fn(client);
  } catch (err) {
    if (err instanceof PolitoApiError) {
      if (err.isUnauthorized()) {
        logger.warn({ userId }, 'Upstream 401 — marking stored token revoked');
        markTokenRevoked(userId);
        throw new ToolAuthError('re_auth_required');
      }
    }
    throw err;
  }
}

export class ToolAuthError extends Error {
  readonly code: 'not_authenticated' | 'no_active_token' | 're_auth_required';
  constructor(code: 'not_authenticated' | 'no_active_token' | 're_auth_required') {
    super(code);
    this.name = 'ToolAuthError';
    this.code = code;
  }
}
