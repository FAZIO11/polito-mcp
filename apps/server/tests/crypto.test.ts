import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptForUser, deriveUserKey, encryptForUser } from '../src/crypto/keys.js';

const master = randomBytes(32).toString('hex');

describe('crypto/keys', () => {
  it('round-trips a token', () => {
    const ct = encryptForUser(master, 'user-1', 'a-secret-token');
    expect(ct).not.toContain('a-secret-token');
    expect(decryptForUser(master, 'user-1', ct)).toBe('a-secret-token');
  });

  it('produces different ciphertexts for the same input (IV randomness)', () => {
    const a = encryptForUser(master, 'user-1', 'x');
    const b = encryptForUser(master, 'user-1', 'x');
    expect(a).not.toBe(b);
  });

  it('refuses to decrypt with a different user id', () => {
    const ct = encryptForUser(master, 'user-1', 'a-secret-token');
    expect(() => decryptForUser(master, 'user-2', ct)).toThrow();
  });

  it('refuses to decrypt with a different master key', () => {
    const ct = encryptForUser(master, 'user-1', 'a-secret-token');
    const other = randomBytes(32).toString('hex');
    expect(() => decryptForUser(other, 'user-1', ct)).toThrow();
  });

  it('detects tampering of the ciphertext', () => {
    const ct = encryptForUser(master, 'user-1', 'a-secret-token');
    const tampered = Buffer.from(ct, 'base64');
    tampered[20] ^= 0xff;
    expect(() => decryptForUser(master, 'user-1', tampered.toString('base64'))).toThrow();
  });

  it('derives a stable 32-byte key per user', () => {
    const k1 = deriveUserKey(master, 'user-1');
    const k2 = deriveUserKey(master, 'user-1');
    const k3 = deriveUserKey(master, 'user-2');
    expect(k1.length).toBe(32);
    expect(k1.equals(k2)).toBe(true);
    expect(k1.equals(k3)).toBe(false);
  });
});
