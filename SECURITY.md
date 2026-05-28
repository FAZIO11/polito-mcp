# Security policy

## Threat model

This server stands between PoliTO students and the unofficial MCP clients they
use to query their student data. Concretely:

1. The student trusts this server with their PoliTO password **for the
   duration of one HTTPS POST**: just long enough for us to exchange it for a
   bearer token at `/auth/login`.
2. After that exchange, we keep only the bearer token, encrypted at rest.
3. Any party with the bearer token can perform actions as the student against
   the PoliTO API until the token expires or is revoked. We therefore treat
   the bearer token like a long-lived password.

## What we do

- **Passwords**: held in a Node `Buffer` for the duration of the upstream call
  to `POST /auth/login`. Overwritten with `crypto.randomFillSync` immediately
  after. Never written to disk. Never logged. Never sent to Sentry.
- **Bearer tokens**: encrypted with AES-256-GCM. The key is derived per-user
  via HKDF(server master key, user id). Compromise of the SQLite file alone
  does not yield usable tokens.
- **Transport**: TLS 1.2+ only in production. HSTS with `preload`. Strict CSP
  on the login page (`default-src 'none'; form-action 'self'; style-src 'self';
  img-src 'self'`). No third-party scripts on auth pages.
- **Rate limits**: 5/minute/IP and 3/minute/matricola on the login endpoint
  (we 429 before forwarding so we don't trip PoliTO's lockout policy).
- **Logging**: Pino with an explicit allow-list of fields. A Vitest test in CI
  POSTs a known-synthetic password and asserts it never appears in captured
  log output. Sentry has the same allow-list applied via `beforeSend`.
- **Data deletion**: `DELETE /me/data` wipes the encrypted token row and
  calls upstream `DELETE /auth/logout` to revoke the bearer at PoliTO.

## What we deliberately do not do

- **No password storage.** Not even hashed, not even briefly. The only way to
  re-authenticate is to log in again.
- **No silent refresh.** Without a stored password and without a PoliTO
  refresh token, expired bearers force a re-login.
- **No third-party analytics, ads, or tracking.** Only Sentry for errors, with
  body redaction.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository or email the
maintainer listed there. Do **not** open a public issue for vulnerabilities.

If we agree there is a vulnerability, expect:

- An acknowledgement within 72 hours.
- A fix or mitigation timeline within 7 days.
- Public disclosure coordinated with you after the fix ships.
