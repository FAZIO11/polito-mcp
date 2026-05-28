import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM with per-user keys.
 *
 *   K_user = HKDF(master, salt=user_id, info="polito-mcp/v1/token-enc", L=32)
 *
 * Stored format: base64(iv || ciphertext || tag).
 * IV is 12 random bytes per encrypt; tag is 16 bytes.
 */
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const INFO = Buffer.from('polito-mcp/v1/token-enc', 'utf8');

export function hexToBuffer(hex: string): Buffer {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error('expected an even-length hex string');
  }
  return Buffer.from(hex, 'hex');
}

export function deriveUserKey(masterHex: string, userId: string): Buffer {
  const master = hexToBuffer(masterHex);
  const out = hkdfSync('sha256', master, Buffer.from(userId, 'utf8'), INFO, KEY_LEN);
  return Buffer.from(out);
}

export function encryptForUser(masterHex: string, userId: string, plaintext: string): string {
  const key = deriveUserKey(masterHex, userId);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Overwrite key material — it's a Buffer copy, but be defensive.
  key.fill(0);
  return Buffer.concat([iv, enc, tag]).toString('base64');
}

export function decryptForUser(masterHex: string, userId: string, payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error('ciphertext too short');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const enc = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const key = deriveUserKey(masterHex, userId);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  key.fill(0);
  return out;
}

/** Best-effort overwrite of secret-bearing strings. */
export function wipeString(input: { value: string }): void {
  input.value = '\0'.repeat(input.value.length);
  input.value = '';
}
