import { SignJWT, jwtVerify } from 'jose';
import { hexToBuffer } from '../crypto/keys.js';
import { loadConfig } from '../config.js';

const ISSUER = () => loadConfig().PUBLIC_ORIGIN;

/** TTL for the access token returned at /token. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface AccessClaims {
  sub: string; // our internal user_id
  username: string; // polito_username, for display
  client_id: string; // OAuth client_id that obtained this token
  scope: string; // space-separated
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  const secret = hexToBuffer(loadConfig().JWT_SECRET);
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER())
    .setAudience('polito-mcp')
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const secret = hexToBuffer(loadConfig().JWT_SECRET);
  const { payload } = await jwtVerify(token, secret, {
    issuer: ISSUER(),
    audience: 'polito-mcp',
  });
  const claims = payload as Partial<AccessClaims>;
  if (!claims.sub || !claims.username || !claims.client_id) {
    throw new Error('JWT missing required claims');
  }
  return {
    sub: claims.sub,
    username: claims.username,
    client_id: claims.client_id,
    scope: claims.scope ?? '',
  };
}
