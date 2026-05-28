import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unlinkSync } from 'node:fs';
import { createApp } from '../src/app.js';
import { resetConfigForTests } from '../src/config.js';
import { closeDb } from '../src/db/sqlite.js';
import { _resetRateLimitsForTests } from '../src/http/rate-limit.js';
import { startFakePolito, type FakePolito } from './fake-polito.js';

let polito: FakePolito;
let app: ReturnType<typeof createApp>;
const dbPath = `./data/test-oauth-${process.pid}.sqlite`;

beforeAll(async () => {
  polito = await startFakePolito();
  resetConfigForTests({
    POLITO_BASE_URL: polito.url,
    PUBLIC_ORIGIN: 'http://localhost:9999',
    ENC_MASTER_KEY: randomBytes(32).toString('hex'),
    JWT_SECRET: randomBytes(32).toString('hex'),
    DB_PATH: dbPath,
    NODE_ENV: 'test',
  });
  app = createApp();
});

afterAll(async () => {
  closeDb();
  try {
    unlinkSync(dbPath);
  } catch {
    /* ignore */
  }
  await polito.stop();
});

function s256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

describe('full OAuth + MCP integration', () => {
  it('returns OAuth discovery metadata', async () => {
    const res = await app.request('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.authorization_endpoint).toBe('http://localhost:9999/authorize');
    expect(body.token_endpoint).toBe('http://localhost:9999/token');
    expect(body.code_challenge_methods_supported).toContain('S256');
  });

  it('end-to-end: register → authorize → token → MCP tools/list & call', async () => {
    _resetRateLimitsForTests();

    // 1. Register a dynamic OAuth client.
    const regRes = await app.request('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'integration-test',
        redirect_uris: ['http://localhost:9999/cb'],
      }),
    });
    expect(regRes.status).toBe(201);
    const reg = (await regRes.json()) as { client_id: string; redirect_uris: string[] };
    expect(reg.client_id).toMatch(/^c_/);

    // 2. GET /authorize should render the hardened login page.
    const verifier = randomBytes(32).toString('base64url');
    const challenge = s256(verifier);
    const qs = new URLSearchParams({
      response_type: 'code',
      client_id: reg.client_id,
      redirect_uri: 'http://localhost:9999/cb',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
      scope: 'mcp',
    });
    const pageRes = await app.request(`/authorize?${qs.toString()}`);
    expect(pageRes.status).toBe(200);
    const html = await pageRes.text();
    expect(html).toContain('Sign in to polito-mcp');
    expect(html).toContain('not Politecnico di Torino');
    expect(pageRes.headers.get('content-security-policy')).toMatch(/default-src 'none'/);

    // 3. POST /authorize → success path → 302 to redirect_uri with code.
    const form = new FormData();
    form.set('client_id', reg.client_id);
    form.set('redirect_uri', 'http://localhost:9999/cb');
    form.set('code_challenge', challenge);
    form.set('code_challenge_method', 'S256');
    form.set('state', 'xyz');
    form.set('scope', 'mcp');
    form.set('username', 's000001');
    form.set('password', 'correct-horse-battery');

    const postRes = await app.request('/authorize', { method: 'POST', body: form });
    expect([301, 302]).toContain(postRes.status);
    const location = postRes.headers.get('location') ?? '';
    expect(location).toMatch(/^http:\/\/localhost:9999\/cb\?code=/);
    const codeUrl = new URL(location);
    const code = codeUrl.searchParams.get('code');
    expect(code).toBeTruthy();
    expect(codeUrl.searchParams.get('state')).toBe('xyz');

    // 4. POST /token with PKCE verifier → JWT.
    const tokForm = new FormData();
    tokForm.set('grant_type', 'authorization_code');
    tokForm.set('code', code!);
    tokForm.set('redirect_uri', 'http://localhost:9999/cb');
    tokForm.set('client_id', reg.client_id);
    tokForm.set('code_verifier', verifier);

    const tokRes = await app.request('/token', { method: 'POST', body: tokForm });
    expect(tokRes.status).toBe(200);
    const tok = (await tokRes.json()) as { access_token: string; token_type: string };
    expect(tok.token_type).toBe('Bearer');
    expect(tok.access_token.split('.').length).toBe(3);

    // 5. Hit /mcp tools/list.
    const listRes = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${tok.access_token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'vitest', version: '0.0.0' },
        },
      }),
    });
    expect(listRes.status).toBe(200);
    const initBody = (await listRes.json()) as { result?: { capabilities?: unknown } };
    expect(initBody.result?.capabilities).toBeDefined();

    // 6. tools/call → get_profile.
    const callRes = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${tok.access_token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_profile', arguments: {} },
      }),
    });
    expect(callRes.status).toBe(200);
    const callBody = (await callRes.json()) as {
      result?: { content?: { type: string; text?: string }[]; isError?: boolean };
    };
    expect(callBody.result?.isError).toBeFalsy();
    const text = callBody.result?.content?.[0]?.text ?? '';
    const data = JSON.parse(text);
    expect(data.username).toBe('s000001');
    expect(data.firstName).toBe('Test');
  });

  it('rejects /token when PKCE verifier is wrong', async () => {
    _resetRateLimitsForTests();

    // Register + authorize to get a code, then submit a bad verifier.
    const regRes = await app.request('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['http://localhost:9999/cb'] }),
    });
    const reg = (await regRes.json()) as { client_id: string };

    const verifier = randomBytes(32).toString('base64url');
    const challenge = s256(verifier);
    const form = new FormData();
    form.set('client_id', reg.client_id);
    form.set('redirect_uri', 'http://localhost:9999/cb');
    form.set('code_challenge', challenge);
    form.set('code_challenge_method', 'S256');
    form.set('username', 's000001');
    form.set('password', 'correct-horse-battery');

    const postRes = await app.request('/authorize', { method: 'POST', body: form });
    const code = new URL(postRes.headers.get('location') ?? '').searchParams.get('code')!;

    const tokForm = new FormData();
    tokForm.set('grant_type', 'authorization_code');
    tokForm.set('code', code);
    tokForm.set('redirect_uri', 'http://localhost:9999/cb');
    tokForm.set('client_id', reg.client_id);
    tokForm.set('code_verifier', 'a-wrong-verifier-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    const tokRes = await app.request('/token', { method: 'POST', body: tokForm });
    expect(tokRes.status).toBe(400);
    const body = (await tokRes.json()) as { error?: string };
    expect(body.error).toBe('invalid_grant');
  });

  it('responds to /mcp without a Bearer token (session-based onboarding flow)', async () => {
    // Unauthenticated connections are now allowed; the MCP transport rejects
    // malformed requests (not Bearer-gated at the HTTP layer anymore).
    const res = await app.request('/mcp', { method: 'POST' });
    expect(res.status).not.toBe(401);
    // Session ID is always echoed back so the client can store it.
    expect(res.headers.get('mcp-session-id')).toBeTruthy();
  });

  it('shows the login page error and refuses bad credentials', async () => {
    _resetRateLimitsForTests();
    const regRes = await app.request('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['http://localhost:9999/cb'] }),
    });
    const reg = (await regRes.json()) as { client_id: string };

    const form = new FormData();
    form.set('client_id', reg.client_id);
    form.set('redirect_uri', 'http://localhost:9999/cb');
    form.set('code_challenge', 'A'.repeat(43));
    form.set('code_challenge_method', 'S256');
    form.set('username', 's000001');
    form.set('password', 'wrong-password');

    const res = await app.request('/authorize', { method: 'POST', body: form });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/PoliTO refused those credentials/);
  });
});
