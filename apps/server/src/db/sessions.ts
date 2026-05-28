import { getDb } from './sqlite.js';

const PENDING_TTL_MS = 15 * 60 * 1000;       // 15 min for unlinked sessions
const LINKED_TTL_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days once linked

export function createPendingSession(sessionId: string): void {
  const now = Date.now();
  getDb()
    .prepare(
      'INSERT OR IGNORE INTO mcp_sessions (session_id, user_id, created_at, expires_at) VALUES (?, NULL, ?, ?)',
    )
    .run(sessionId, now, now + PENDING_TTL_MS);
}

export function linkSessionToUser(sessionId: string, userId: string): void {
  const now = Date.now();
  getDb()
    .prepare(
      'INSERT INTO mcp_sessions (session_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET user_id = excluded.user_id, expires_at = excluded.expires_at',
    )
    .run(sessionId, userId, now, now + LINKED_TTL_MS);
}

/** Returns the userId linked to this session, or null if pending/expired/unknown. */
export function lookupSessionUserId(sessionId: string): string | null {
  const row = getDb()
    .prepare<[string, number], { user_id: string | null }>(
      'SELECT user_id FROM mcp_sessions WHERE session_id = ? AND expires_at > ?',
    )
    .get(sessionId, Date.now());
  return row?.user_id ?? null;
}

/** True if the session exists and hasn't expired (even if not yet linked to a user). */
export function isValidSession(sessionId: string): boolean {
  const row = getDb()
    .prepare<[string, number], { session_id: string }>(
      'SELECT session_id FROM mcp_sessions WHERE session_id = ? AND expires_at > ?',
    )
    .get(sessionId, Date.now());
  return !!row;
}

export function cleanExpiredSessions(): void {
  getDb().prepare('DELETE FROM mcp_sessions WHERE expires_at <= ?').run(Date.now());
}

// ---- IP-based auth (persists across MCP reconnects) ----

const IP_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Called after a successful /connect login to remember this IP → user mapping. */
export function upsertIpSession(ip: string, userId: string): void {
  getDb()
    .prepare(
      'INSERT INTO ip_sessions (ip, user_id, expires_at) VALUES (?, ?, ?) ON CONFLICT(ip) DO UPDATE SET user_id = excluded.user_id, expires_at = excluded.expires_at',
    )
    .run(ip, userId, Date.now() + IP_SESSION_TTL_MS);
}

/** Returns the userId for this IP if it has a live session, otherwise null. */
export function lookupIpUserId(ip: string): string | null {
  const row = getDb()
    .prepare<[string, number], { user_id: string }>(
      'SELECT user_id FROM ip_sessions WHERE ip = ? AND expires_at > ?',
    )
    .get(ip, Date.now());
  return row?.user_id ?? null;
}
