import { Hono } from 'hono';
import { loadConfig } from '../config.js';
import { PolitoClient, PolitoApiError } from '../polito/client.js';
import { normalizePolitoLoginUsername } from '../auth/login-username.js';
import { upsertUserAndToken } from '../db/users.js';
import { isValidSession, linkSessionToUser } from '../db/sessions.js';
import { renderLoginPage } from './login-page.js';
import { rateLimit, recordMatricolaAttempt } from './rate-limit.js';
import { logger } from '../logger.js';
import type { AppEnv } from './context.js';

const SOURCE_REPO = 'https://github.com/FAZIO11/polito-mcp';

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSuccess(username: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connected — polito-mcp</title>
<style>
  :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body { max-width: 32rem; margin: 2rem auto; padding: 0 1.25rem 4rem; line-height: 1.5; }
  h1 { font-size: 1.5rem; }
  .success {
    border: 2px solid #0a6;
    background: #f0fff4;
    color: #065;
    padding: 1rem;
    border-radius: 6px;
    margin: 1.25rem 0;
  }
  @media (prefers-color-scheme: dark) {
    .success { background: #0a2a12; color: #6fdb8a; }
  }
</style>
</head>
<body>
<h1>Connected!</h1>
<div class="success">
  Your PoliTO account <strong>${htmlEscape(username)}</strong> is now connected to polito-mcp.
</div>
<p>Go back to Claude (or your MCP client) and ask your question again. Your account is stored — you won't need to sign in again.</p>
</body>
</html>`;
}

function renderExpired(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Session expired — polito-mcp</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 2rem auto; padding: 0 1.25rem; }
</style>
</head>
<body>
<h1>Session expired</h1>
<p>This link has expired or is invalid. Go back to Claude, ask a question again to get a fresh link, and try once more.</p>
</body>
</html>`;
}

export function createConnectApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Rate-limit both GET and POST to the connect endpoints.
  app.use('/connect', rateLimit({ max: 10, windowMs: 60_000, scope: 'connect' }));

  // GET /connect?s=<session_id>  — renders the login form
  app.get('/connect', (c) => {
    const s = c.req.query('s') ?? '';
    if (!s || !isValidSession(s)) {
      return c.html(renderExpired(), 400);
    }
    const cfg = loadConfig();
    return c.html(renderLoginPage({
      actionUrl: '/connect',
      hidden: { s },
      publicOrigin: cfg.PUBLIC_ORIGIN,
      sourceRepoUrl: SOURCE_REPO,
    }));
  });

  // POST /connect  — authenticates and links the session
  app.post('/connect', async (c) => {
    const cfg = loadConfig();
    const form = await c.req.formData();
    const s = String(form.get('s') ?? '').trim();
    const rawUsername = String(form.get('username') ?? '').trim();
    const pwHolder = { value: String(form.get('password') ?? '') };

    const rerender = (errorMessage: string) =>
      c.html(renderLoginPage({
        actionUrl: '/connect',
        hidden: { s },
        publicOrigin: cfg.PUBLIC_ORIGIN,
        sourceRepoUrl: SOURCE_REPO,
        errorMessage,
        prefillUsername: rawUsername,
      }), 422);

    if (!s || !isValidSession(s)) {
      return c.html(renderExpired(), 400);
    }

    if (!rawUsername || !pwHolder.value) {
      return rerender('Email and password are required.');
    }

    const politoUsername = normalizePolitoLoginUsername(rawUsername);

    if (!recordMatricolaAttempt(politoUsername)) {
      pwHolder.value = '';
      return rerender('Too many attempts. Please wait a minute and try again.');
    }

    const client = new PolitoClient(cfg.POLITO_BASE_URL, null);
    try {
      const identity = await client.loginBasic({
        username: politoUsername,
        password: pwHolder.value,
      });
      pwHolder.value = '';

      const user = upsertUserAndToken({
        username: identity.username,
        politoClientId: identity.clientId ?? null,
        politoToken: identity.token,
      });

      linkSessionToUser(s, user.user_id);
      logger.info({ userId: user.user_id }, 'connect: session linked');

      return c.html(renderSuccess(identity.username));
    } catch (err) {
      pwHolder.value = '';

      if (err instanceof PolitoApiError) {
        logger.info({ status: err.status }, 'connect: PoliTO login rejected');
        if (err.status === 401 || err.status === 400 || err.status === 403) {
          return rerender('PoliTO refused those credentials. Check your student email and password.');
        }
        return rerender(`PoliTO is unreachable right now (status ${err.status}). Try again in a minute.`);
      }

      logger.error({ err }, 'connect: unexpected error');
      return rerender('Something went wrong. Please try again.');
    }
  });

  return app;
}
