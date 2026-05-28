import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config.js';
import { decryptForUser, encryptForUser } from '../crypto/keys.js';
import { getDb } from './sqlite.js';

export interface UserRecord {
  user_id: string;
  polito_username: string;
  polito_client_id: string | null;
  created_at: number;
  last_seen: number;
}

export function findUserByUsername(username: string): UserRecord | undefined {
  return getDb()
    .prepare<[string], UserRecord>(
      'SELECT user_id, polito_username, polito_client_id, created_at, last_seen FROM users WHERE polito_username = ?',
    )
    .get(username);
}

export function findUserById(userId: string): UserRecord | undefined {
  return getDb()
    .prepare<[string], UserRecord>(
      'SELECT user_id, polito_username, polito_client_id, created_at, last_seen FROM users WHERE user_id = ?',
    )
    .get(userId);
}

export function upsertUserAndToken(input: {
  username: string;
  politoClientId: string | null;
  politoToken: string;
}): UserRecord {
  const db = getDb();
  const cfg = loadConfig();
  const now = Date.now();

  const existing = findUserByUsername(input.username);
  const userId = existing?.user_id ?? randomUUID();

  const tx = db.transaction(() => {
    if (existing) {
      db.prepare(
        'UPDATE users SET polito_client_id = ?, last_seen = ? WHERE user_id = ?',
      ).run(input.politoClientId, now, userId);
    } else {
      db.prepare(
        'INSERT INTO users (user_id, polito_username, polito_client_id, created_at, last_seen) VALUES (?, ?, ?, ?, ?)',
      ).run(userId, input.username, input.politoClientId, now, now);
    }

    const ct = encryptForUser(cfg.ENC_MASTER_KEY, userId, input.politoToken);
    db.prepare(
      `INSERT INTO user_tokens (user_id, polito_token_ct, updated_at, revoked)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(user_id) DO UPDATE SET polito_token_ct = excluded.polito_token_ct, updated_at = excluded.updated_at, revoked = 0`,
    ).run(userId, ct, now);
  });
  tx();

  return findUserById(userId)!;
}

export function getDecryptedToken(userId: string): string | undefined {
  const cfg = loadConfig();
  const row = getDb()
    .prepare<[string], { polito_token_ct: string; revoked: number }>(
      'SELECT polito_token_ct, revoked FROM user_tokens WHERE user_id = ?',
    )
    .get(userId);
  if (!row || row.revoked) return undefined;
  return decryptForUser(cfg.ENC_MASTER_KEY, userId, row.polito_token_ct);
}

export function markTokenRevoked(userId: string): void {
  getDb()
    .prepare('UPDATE user_tokens SET revoked = 1, updated_at = ? WHERE user_id = ?')
    .run(Date.now(), userId);
}

export function deleteUserCompletely(userId: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM user_tokens WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM oauth_codes WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE user_id = ?').run(userId);
  });
  tx();
}

export function touchLastSeen(userId: string): void {
  getDb().prepare('UPDATE users SET last_seen = ? WHERE user_id = ?').run(Date.now(), userId);
}
