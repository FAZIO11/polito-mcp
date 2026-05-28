import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadConfig } from '../config.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const cfg = loadConfig();
  const path = resolve(cfg.DB_PATH);
  mkdirSync(dirname(path), { recursive: true });
  const inst = new Database(path);
  inst.pragma('journal_mode = WAL');
  inst.pragma('synchronous = NORMAL');
  inst.pragma('foreign_keys = ON');
  migrate(inst);
  db = inst;
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      polito_username TEXT NOT NULL UNIQUE,
      polito_client_id TEXT,
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );

    -- ciphertext column is base64(iv||ct||tag) of the upstream bearer token.
    CREATE TABLE IF NOT EXISTS user_tokens (
      user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
      polito_token_ct TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0
    );

    -- RFC 7591 dynamically-registered OAuth clients.
    CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id TEXT PRIMARY KEY,
      client_name TEXT,
      redirect_uris TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- Short-lived OAuth authorization codes.
    CREATE TABLE IF NOT EXISTS oauth_codes (
      code TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      code_challenge TEXT NOT NULL,
      code_challenge_method TEXT NOT NULL,
      scope TEXT,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_oauth_codes_expiry ON oauth_codes(expires_at);

    INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('version', '1');
  `);
}
