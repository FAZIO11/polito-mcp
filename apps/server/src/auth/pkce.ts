import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * RFC 7636 — verify a PKCE code_verifier against a stored code_challenge.
 * Returns false on any mismatch or unknown method. Comparison is constant-time.
 */
export function verifyPkce(
  verifier: string,
  challenge: string,
  method: string,
): boolean {
  if (!verifier || !challenge) return false;
  let computed: string;
  if (method === 'S256') {
    computed = createHash('sha256').update(verifier).digest('base64url');
  } else if (method === 'plain') {
    computed = verifier;
  } else {
    return false;
  }
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
