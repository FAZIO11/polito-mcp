import { randomBytes, randomUUID } from 'node:crypto';
import { getDb } from './sqlite.js';

export interface OAuthClient {
  client_id: string;
  client_name: string | null;
  redirect_uris: string[];
  created_at: number;
}

interface ClientRow {
  client_id: string;
  client_name: string | null;
  redirect_uris: string;
  created_at: number;
}

export function registerClient(input: {
  client_name?: string | null;
  redirect_uris: string[];
}): OAuthClient {
  const db = getDb();
  const id = `c_${randomUUID().replace(/-/g, '')}`;
  const now = Date.now();
  db.prepare(
    'INSERT INTO oauth_clients (client_id, client_name, redirect_uris, created_at) VALUES (?, ?, ?, ?)',
  ).run(id, input.client_name ?? null, JSON.stringify(input.redirect_uris), now);
  return {
    client_id: id,
    client_name: input.client_name ?? null,
    redirect_uris: input.redirect_uris,
    created_at: now,
  };
}

export function findClient(clientId: string): OAuthClient | undefined {
  const row = getDb()
    .prepare<[string], ClientRow>(
      'SELECT client_id, client_name, redirect_uris, created_at FROM oauth_clients WHERE client_id = ?',
    )
    .get(clientId);
  if (!row) return undefined;
  return {
    client_id: row.client_id,
    client_name: row.client_name,
    redirect_uris: JSON.parse(row.redirect_uris) as string[],
    created_at: row.created_at,
  };
}

export interface AuthCode {
  code: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string | null;
  expires_at: number;
}

const CODE_TTL_MS = 60_000;

export function issueAuthCode(input: {
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: 'S256' | 'plain';
  scope?: string;
}): AuthCode {
  const db = getDb();
  const code = randomBytes(32).toString('base64url');
  const expires = Date.now() + CODE_TTL_MS;
  db.prepare(
    `INSERT INTO oauth_codes (code, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    code,
    input.client_id,
    input.user_id,
    input.redirect_uri,
    input.code_challenge,
    input.code_challenge_method,
    input.scope ?? null,
    expires,
  );
  return {
    code,
    client_id: input.client_id,
    user_id: input.user_id,
    redirect_uri: input.redirect_uri,
    code_challenge: input.code_challenge,
    code_challenge_method: input.code_challenge_method,
    scope: input.scope ?? null,
    expires_at: expires,
  };
}

export function consumeAuthCode(code: string): AuthCode | undefined {
  const db = getDb();
  const tx = db.transaction((c: string) => {
    const row = db
      .prepare<[string], AuthCode>(
        'SELECT code, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, expires_at FROM oauth_codes WHERE code = ?',
      )
      .get(c);
    if (!row) return undefined;
    db.prepare('DELETE FROM oauth_codes WHERE code = ?').run(c);
    if (row.expires_at < Date.now()) return undefined;
    return row;
  });
  return tx(code);
}

export function purgeExpiredCodes(): number {
  const res = getDb().prepare('DELETE FROM oauth_codes WHERE expires_at < ?').run(Date.now());
  return res.changes;
}
