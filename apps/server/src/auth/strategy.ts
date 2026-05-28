/**
 * Pluggable upstream-authentication strategy.
 *
 * v1 only ships `PasswordStrategy`. The eventual `SsoStrategy` (after PoliTO
 * grants a registered redirect_uri) will satisfy the same contract: the
 * OAuth Authorization Server code in `src/auth/server.ts` does NOT know which
 * strategy is in use.
 */
import type { Context } from 'hono';
import type { AppEnv } from '../http/context.js';

export interface UpstreamAuthResult {
  /** PoliTO username (matricola) returned by /auth/login. */
  politoUsername: string;
  /** Client id assigned by PoliTO; needed for /switch-career and /logout. */
  politoClientId: string | null;
  /** The opaque bearer token returned by /auth/login. */
  politoToken: string;
}

/**
 * Each strategy implements two phases:
 *
 *  1. `start`: decide what happens after `GET /authorize`. Either render our
 *     own login page (`renderLogin: true`) or redirect the user to an external
 *     IdP (`redirectTo: URL`). The OAuth `state`/`code_challenge` are
 *     preserved by the server via a signed cookie.
 *
 *  2. `complete`: invoked from our final HTTP handler with whatever evidence
 *     the strategy needs to exchange for a PoliTO bearer token. Returns the
 *     bearer + identity, after which the server mints an OAuth auth code.
 */
export interface AuthStrategy {
  readonly id: 'password' | 'sso';

  start(c: Context<AppEnv>): Promise<{ renderLogin: true } | { redirectTo: URL }>;

  complete(c: Context<AppEnv>): Promise<UpstreamAuthResult>;
}
