import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../http/context.js';
import { loadConfig } from '../config.js';
import { logger } from '../logger.js';
import {
  consumeAuthCode,
  findClient,
  issueAuthCode,
  registerClient,
} from '../db/oauth.js';
import { findUserByUsername } from '../db/users.js';
import { rateLimit, recordMatricolaAttempt } from '../http/rate-limit.js';
import { renderLoginPage } from '../http/login-page.js';
import { BadCredentialsError, PasswordStrategy } from './password.js';
import { signAccessToken } from './jwt.js';
import { verifyPkce } from './pkce.js';
import type { AuthStrategy } from './strategy.js';

const SOURCE_REPO = 'https://github.com/FAZIO11/polito-mcp';

const AuthorizeQuery = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.enum(['S256', 'plain']).default('S256'),
  state: z.string().optional(),
  scope: z.string().optional(),
});

const TokenForm = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string().min(1),
  redirect_uri: z.string().url(),
  client_id: z.string().min(1),
  code_verifier: z.string().min(43).max(128),
});

const RegisterBody = z.object({
  client_name: z.string().optional(),
  redirect_uris: z.array(z.string().url()).min(1),
});

const HIDDEN_FIELDS = [
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
  'state',
  'scope',
] as const;

/**
 * Mounts the OAuth Authorization Server endpoints + RFC 7591 dynamic client
 * registration. Pass the active upstream-auth strategy at construction time.
 */
export function createAuthServer(strategy: AuthStrategy = new PasswordStrategy()): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // ---- Discovery ----
  app.get('/.well-known/oauth-authorization-server', (c) => {
    const origin = loadConfig().PUBLIC_ORIGIN;
    return c.json({
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      revocation_endpoint: `${origin}/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['mcp'],
    });
  });

  app.get('/.well-known/openid-configuration', (c) => {
    const origin = loadConfig().PUBLIC_ORIGIN;
    return c.json({
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['HS256'],
      code_challenge_methods_supported: ['S256'],
    });
  });

  // ---- RFC 7591 dynamic client registration ----
  app.post('/register', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_request', error_description: 'Body must be JSON.' }, 400);
    }
    const parsed = RegisterBody.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: 'invalid_client_metadata', error_description: parsed.error.message },
        400,
      );
    }
    const client = registerClient({
      client_name: parsed.data.client_name ?? null,
      redirect_uris: parsed.data.redirect_uris,
    });
    return c.json(
      {
        client_id: client.client_id,
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code'],
        response_types: ['code'],
      },
      201,
    );
  });

  // ---- /authorize ----
  app.get('/authorize', async (c) => {
    const parsed = AuthorizeQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!parsed.success) {
      return badAuthorizeRequest(c, parsed.error.message);
    }
    const validation = await validateAuthorize(parsed.data);
    if ('error' in validation) {
      return badAuthorizeRequest(c, validation.error);
    }

    const result = await strategy.start(c);
    if ('redirectTo' in result) {
      return c.redirect(result.redirectTo.toString(), 302);
    }
    return renderLogin(c, parsed.data, null);
  });

  app.post(
    '/authorize',
    rateLimit({ max: 5, windowMs: 60_000, scope: 'authorize-ip' }),
    async (c) => {
      // Parse the body once and stash it on the context so the strategy can
      // re-use the parsed FormData (the underlying body can only be read once).
      const form = await c.req.formData();
      c.set('parsedForm', form);

      const queryShape: Record<string, string | undefined> = {};
      for (const k of HIDDEN_FIELDS) {
        const v = form.get(k);
        if (v != null) queryShape[k] = String(v);
      }
      queryShape['response_type'] = 'code';
      const parsed = AuthorizeQuery.safeParse(queryShape);
      if (!parsed.success) return badAuthorizeRequest(c, parsed.error.message);

      const validation = await validateAuthorize(parsed.data);
      if ('error' in validation) return badAuthorizeRequest(c, validation.error);

      // Per-matricola rate limit, applied AFTER parsing the form once.
      const submittedMatricola = String(form.get('username') ?? '').trim();
      if (submittedMatricola && !recordMatricolaAttempt(submittedMatricola, 3, 60_000)) {
        return renderLogin(c, parsed.data, 'Too many attempts. Please wait a minute.');
      }

    try {
      const upstream = await strategy.complete(c);
      const user = findUserByUsername(upstream.politoUsername);
      if (!user) {
        return badAuthorizeRequest(c, 'Internal error: user record missing after login.');
      }
      const issued = issueAuthCode({
        client_id: parsed.data.client_id,
        user_id: user.user_id,
        redirect_uri: parsed.data.redirect_uri,
        code_challenge: parsed.data.code_challenge,
        code_challenge_method: parsed.data.code_challenge_method,
        scope: parsed.data.scope,
      });
      const url = new URL(parsed.data.redirect_uri);
      url.searchParams.set('code', issued.code);
      if (parsed.data.state) url.searchParams.set('state', parsed.data.state);
      logger.info({ redirect_uri: parsed.data.redirect_uri }, 'auth code issued, redirecting');
      return c.redirect(url.toString(), 302);
    } catch (err) {
      if (err instanceof BadCredentialsError) {
        return renderLogin(c, parsed.data, err.message);
      }
      logger.error({ err }, 'unexpected error during /authorize POST');
      return renderLogin(c, parsed.data, 'Something went wrong. Please try again.');
    }
    },
  );

  // ---- /token ----
  app.post('/token', rateLimit({ max: 30, windowMs: 60_000, scope: 'token-ip' }), async (c) => {
    const form = await c.req.formData();
    const obj: Record<string, string> = {};
    form.forEach((v, k) => {
      obj[k] = String(v);
    });
    const parsed = TokenForm.safeParse(obj);
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', error_description: parsed.error.message }, 400);
    }
    const code = consumeAuthCode(parsed.data.code);
    if (!code) {
      return c.json({ error: 'invalid_grant' }, 400);
    }
    if (
      code.client_id !== parsed.data.client_id ||
      code.redirect_uri !== parsed.data.redirect_uri
    ) {
      return c.json({ error: 'invalid_grant' }, 400);
    }
    if (!verifyPkce(parsed.data.code_verifier, code.code_challenge, code.code_challenge_method)) {
      return c.json({ error: 'invalid_grant' }, 400);
    }

    const client = findClient(code.client_id);
    if (!client) return c.json({ error: 'invalid_client' }, 400);

    // We need the polito_username for display claims.
    const userRow = await import('../db/users.js').then((m) => m.findUserById(code.user_id));
    if (!userRow) return c.json({ error: 'invalid_grant' }, 400);

    const token = await signAccessToken({
      sub: code.user_id,
      username: userRow.polito_username,
      client_id: client.client_id,
      scope: code.scope ?? 'mcp',
    });

    return c.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 60 * 60 * 24 * 30,
      scope: code.scope ?? 'mcp',
    });
  });

  // ---- /revoke (RFC 7009) ----
  app.post('/revoke', async (c) => {
    // For now we just acknowledge. Real revocation happens when a tool call
    // hits upstream 401, or via DELETE /me/data which calls PoliTO logout.
    return c.body(null, 200);
  });

  return app;

  // ---------- helpers ----------
  function renderLogin(
    c: import('hono').Context,
    q: z.infer<typeof AuthorizeQuery>,
    error: string | null,
  ) {
    const hidden: Record<string, string> = {};
    for (const k of HIDDEN_FIELDS) {
      const v = (q as Record<string, unknown>)[k];
      if (typeof v === 'string') hidden[k] = v;
    }
    const cfg = loadConfig();
    c.header(
      'Content-Security-Policy',
      "default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    return c.html(
      renderLoginPage({
        actionUrl: '/authorize',
        hidden,
        publicOrigin: cfg.PUBLIC_ORIGIN,
        sourceRepoUrl: SOURCE_REPO,
        ...(error ? { errorMessage: error } : {}),
      }),
    );
  }

  function badAuthorizeRequest(c: import('hono').Context, msg: string) {
    return c.json({ error: 'invalid_request', error_description: msg }, 400);
  }

  async function validateAuthorize(
    q: z.infer<typeof AuthorizeQuery>,
  ): Promise<{ ok: true } | { error: string }> {
    const client = findClient(q.client_id);
    if (!client) return { error: 'Unknown client_id. Register first at /register.' };
    if (!client.redirect_uris.includes(q.redirect_uri)) {
      return { error: 'redirect_uri does not match the registration.' };
    }
    return { ok: true };
  }
}

