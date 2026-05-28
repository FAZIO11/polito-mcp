import { Hono } from 'hono';
import { verifyAccessToken } from '../auth/jwt.js';
import { deleteUserCompletely, getDecryptedToken } from '../db/users.js';
import { logger } from '../logger.js';
import { loadConfig } from '../config.js';
import { PolitoClient } from '../polito/client.js';
import type { AppEnv } from './context.js';

/**
 * Authenticated user-account routes: GET /me, DELETE /me/data.
 */
export function createAccountApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('/me/*', async (c, next) => {
    const auth = c.req.header('authorization') ?? '';
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!bearer) return c.json({ error: 'unauthorized' }, 401);
    try {
      const claims = await verifyAccessToken(bearer);
      c.set('accessClaims', claims);
      await next();
    } catch {
      return c.json({ error: 'invalid_token' }, 401);
    }
  });

  app.get('/me', (c) => {
    const claims = c.get('accessClaims');
    return c.json({ user_id: claims.sub, username: claims.username, client_id: claims.client_id });
  });

  app.delete('/me/data', async (c) => {
    const claims = c.get('accessClaims');
    const cfg = loadConfig();
    const token = getDecryptedToken(claims.sub);
    if (token) {
      try {
        await new PolitoClient(cfg.POLITO_BASE_URL, token).logout();
      } catch (err) {
        logger.warn({ err }, 'Upstream PoliTO logout failed during account deletion');
      }
    }
    deleteUserCompletely(claims.sub);
    return c.json({ deleted: true });
  });

  return app;
}
