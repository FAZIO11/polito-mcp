import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyPkce } from '../src/auth/pkce.js';

describe('PKCE', () => {
  it('S256 happy path', () => {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(verifyPkce(verifier, challenge, 'S256')).toBe(true);
  });

  it('S256 wrong verifier', () => {
    const v = randomBytes(32).toString('base64url');
    const ch = createHash('sha256').update(v).digest('base64url');
    expect(verifyPkce('wrong-verifier-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ch, 'S256')).toBe(
      false,
    );
  });

  it('plain method', () => {
    expect(verifyPkce('abc', 'abc', 'plain')).toBe(true);
    expect(verifyPkce('abc', 'abd', 'plain')).toBe(false);
  });

  it('unknown method', () => {
    expect(verifyPkce('abc', 'abc', 'something')).toBe(false);
  });

  it('empty inputs reject', () => {
    expect(verifyPkce('', 'abc', 'S256')).toBe(false);
    expect(verifyPkce('abc', '', 'S256')).toBe(false);
  });
});
