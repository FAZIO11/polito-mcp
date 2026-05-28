import type { Context } from 'hono';
import type { AppEnv } from '../http/context.js';
import { loadConfig } from '../config.js';
import { logger } from '../logger.js';
import { PolitoApiError, PolitoClient } from '../polito/client.js';
import { upsertUserAndToken } from '../db/users.js';
import { BadCredentialsError } from './errors.js';
import { normalizePolitoLoginUsername } from './login-username.js';
import type { AuthStrategy, UpstreamAuthResult } from './strategy.js';

/**
 * Username + password against PoliTO `/auth/login` `loginType=basic`.
 *
 * The password is held in a single string for the duration of the upstream
 * call, then deleted from all references and overwritten where possible.
 */
export class PasswordStrategy implements AuthStrategy {
  readonly id = 'password' as const;

  async start(): Promise<{ renderLogin: true }> {
    return { renderLogin: true };
  }

  async complete(c: Context<AppEnv>): Promise<UpstreamAuthResult> {
    // The body has already been parsed by the OAuth server handler and stashed
    // on the context, since FormData can only be read from the underlying
    // stream once.
    const form = c.get('parsedForm') ?? (await c.req.formData());
    let username = String(form.get('username') ?? '').trim();
    // Wrap password so we can null it out below.
    const pwHolder: { value: string } = {
      value: String(form.get('password') ?? ''),
    };

    if (!username || !pwHolder.value) {
      throw new BadCredentialsError('Email or matricola and password are required.');
    }
    const politoUsername = normalizePolitoLoginUsername(username);

    const cfg = loadConfig();
    const client = new PolitoClient(cfg.POLITO_BASE_URL, null);
    try {
      const identity = await client.loginBasic({
        username: politoUsername,
        password: pwHolder.value,
      });

      const result: UpstreamAuthResult = {
        politoUsername: identity.username,
        politoClientId: identity.clientId ?? null,
        politoToken: identity.token,
      };

      // Persist immediately so the OAuth code-exchange step can look us up.
      upsertUserAndToken({
        username: result.politoUsername,
        politoClientId: result.politoClientId,
        politoToken: result.politoToken,
      });

      return result;
    } catch (err) {
      if (err instanceof PolitoApiError) {
        logger.info(
          { status: err.status, code: err.code },
          'PoliTO upstream login rejected',
        );
        if (err.status === 401 || err.status === 400 || err.status === 403) {
          throw new BadCredentialsError(
            'PoliTO refused those credentials. Check your student email and password.',
          );
        }
        throw new BadCredentialsError(
          `PoliTO is unreachable right now (status ${err.status}). Try again in a minute.`,
        );
      }
      throw err;
    } finally {
      // Best-effort: drop references so the GC can reclaim the password buffer.
      pwHolder.value = '';
      username = '';
    }
  }
}

export { BadCredentialsError } from './errors.js';
