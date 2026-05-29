# polito-mcp — CLAUDE.md

## Git commit style

Never add `Co-Authored-By` trailers to commits. Do not mention Claude or Anthropic in commit messages.

Unofficial MCP server that wraps the Politecnico di Torino student API so that
MCP-aware AI clients (Claude Desktop, Cursor, Windsurf, VS Code Copilot) can
read a student's profile, grades, lectures, deadlines, messages, exams, and
bookings via natural language.

**Owner:** Fazil Abdul Sathar (s334745)  
**Repo:** https://github.com/FAZIO11/polito-mcp  
**Live server:** https://polito-mcp.fly.dev  
**Status:** v0.1 — fully deployed, OAuth working, all 15 MCP tools functional

---

## Architecture

```
polito-mcp/
├── apps/server/          # The only app in this monorepo
│   ├── src/
│   │   ├── app.ts            # Hono app wiring + request logger middleware
│   │   ├── index.ts          # Entry point: binds port, handles SIGINT
│   │   ├── config.ts         # Zod-validated env vars, singleton cached
│   │   ├── logger.ts         # Pino logger with password redaction allowlist
│   │   ├── auth/
│   │   │   ├── server.ts     # OAuth 2.1 AS: /authorize /token /register /revoke
│   │   │   ├── password.ts   # PasswordStrategy: proxies creds to PoliTO /auth/login
│   │   │   ├── login-username.ts  # Normalises email OR matricola → matricola
│   │   │   ├── strategy.ts   # AuthStrategy interface (pluggable; SSO stub exists)
│   │   │   ├── jwt.ts        # Signs/verifies our short-lived access tokens (HMAC-SHA256)
│   │   │   ├── pkce.ts       # PKCE S256 verifier
│   │   │   └── errors.ts     # BadCredentialsError
│   │   ├── db/
│   │   │   ├── sqlite.ts     # better-sqlite3 singleton, WAL mode, inline migrations
│   │   │   ├── users.ts      # upsert/find/delete users + encrypted token CRUD
│   │   │   └── oauth.ts      # Dynamic client registration + auth code lifecycle
│   │   ├── crypto/
│   │   │   └── keys.ts       # AES-256-GCM per-user HKDF keys for token encryption at rest
│   │   ├── http/
│   │   │   ├── login-page.ts # Server-rendered login form (no JS, no 3P assets)
│   │   │   ├── account.ts    # DELETE /me/data account wipe endpoint
│   │   │   ├── rate-limit.ts # In-memory rate limiting (per IP + per matricola)
│   │   │   └── context.ts    # Hono AppEnv type (parsedForm on context)
│   │   ├── mcp/
│   │   │   ├── server.ts     # MCP Streamable HTTP transport mount
│   │   │   ├── tools.ts      # All 15 MCP tool registrations
│   │   │   └── auth-context.ts  # withPoliTo() helper, ToolAuthError, token revocation
│   │   ├── polito/
│   │   │   ├── client.ts     # PolitoClient: typed wrapper over PoliTO REST API
│   │   │   └── types.ts      # TypeScript types mirroring polito/api-spec
│   │   └── observability/
│   │       └── sentry.ts     # Optional Sentry init (SENTRY_DSN env var)
│   └── tests/
│       ├── fake-polito.ts    # In-process mock PoliTO server (Hono) for integration tests
│       ├── oauth-flow.test.ts
│       ├── pkce.test.ts
│       ├── login-username.test.ts
│       ├── crypto.test.ts
│       ├── rate-limit.test.ts
│       ├── redaction.test.ts
│       └── real-polito.smoke.ts  # Manual smoke test against real PoliTO API
├── infra/
│   └── fly.toml              # Fly.io config: fra region, /data volume, 256 MB
├── Dockerfile                # Node 20 Alpine, non-root user, tini PID 1
└── .github/workflows/
    ├── ci.yml                # vitest + tsc on every push
    └── deploy.yml            # fly deploy on push to main (needs FLY_API_TOKEN secret)
```

### Request flow

```
MCP client
  → POST /mcp  (Bearer JWT)
  → MCP HTTP transport (SDK)
  → tool handler in tools.ts
  → withPoliTo(userId, fn)         # decrypts stored bearer, calls PoliTO API
  → PolitoClient.someMethod()
  → https://app.didattica.polito.it/api/...
```

### Auth flow (first connection)

```
MCP client  →  POST /register           (RFC 7591 dynamic client registration)
            →  GET  /authorize           (renders login page)
            ←  POST /authorize           (user submits email+password)
                  → PoliTO /auth/login   (verify credentials, get bearer token)
                  → encrypt bearer, store in SQLite
                  → 302 to interstitial HTML page (cursor:// scheme)
            ←  user clicks "Open in app" button
            →  token exchange POST /token  (PKCE code verifier)
            ←  our JWT access token (30-day expiry)
```

---

## Key design decisions

**PoliTO API base URL:** `https://app.didattica.polito.it/api`
- Without `/api`, the host redirects to SAML SSO (302 → idp.polito.it → 500)
- Mock for dev: `https://app.didattica.polito.it/mock/api`

**Custom scheme OAuth redirect (cursor://, etc.):**
- Safari and most browsers silently ignore HTTP 302 redirects to custom schemes
- Fix: render an interstitial HTML page with `window.location.href` (JS context)
  and an `<a href>` fallback button — the user gesture triggers the OS handler
- Critical: use separate escaping for JS context (`jsSafe`) vs HTML attr (`htmlSafe`)
  — `&amp;` in a JS string literal breaks the URL (state param goes missing)

**Token encryption:**
- PoliTO bearer is encrypted with AES-256-GCM
- Key = HKDF(ENC_MASTER_KEY, userId) — per-user derived key
- Stored as base64(iv || ciphertext || tag) in `user_tokens.polito_token_ct`
- Password is zeroed from memory immediately after the upstream call returns

**Login accepts both formats:**
- `s334745@studenti.polito.it` (student email)
- `s334745` (matricola only)
- Both normalise to the matricola before hitting PoliTO `/auth/login`

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ENC_MASTER_KEY` | ✅ | 64 hex chars (32 bytes). HKDF master for token encryption. |
| `JWT_SECRET` | ✅ | 64 hex chars (32 bytes). Signs our OAuth access tokens. |
| `POLITO_BASE_URL` | ✅ | `https://app.didattica.polito.it/api` in prod. |
| `PUBLIC_ORIGIN` | ✅ | `https://polito-mcp.fly.dev` in prod. Used in OAuth discovery + login page. |
| `PORT` | optional | Default 8787 (dev), 8080 (fly.toml sets this). |
| `DB_PATH` | optional | Default `./data/polito-mcp.sqlite`. Fly sets `/data/polito-mcp.sqlite`. |
| `LOG_LEVEL` | optional | `trace/debug/info/warn/error/fatal`. Default `info`. |
| `SENTRY_DSN` | optional | Enables Sentry error tracking. |
| `NODE_ENV` | optional | `production` enables HSTS headers. |

Generate secrets:
```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

---

## Development workflow

```bash
# Install
npm install

# Dev server (hot reload)
npm run dev                    # runs from apps/server/

# Build
npm run build                  # tsc, output to apps/server/dist/

# Tests (run from apps/server/)
cd apps/server
npx vitest run                 # 28 tests, ~1s

# Typecheck only
npx tsc --noEmit -p apps/server/tsconfig.json

# Smoke test against real PoliTO API (never commit credentials)
POLITO_TEST_USERNAME=s334745 \
POLITO_TEST_PASSWORD='...' \
npx tsx apps/server/tests/real-polito.smoke.ts
```

---

## Deployment

**Auto-deploy:** push to `main` → GitHub Actions (`deploy.yml`) → `fly deploy`
Requires `FLY_API_TOKEN` set as a GitHub repo secret.

**Manual deploy:**
```bash
fly deploy --remote-only --config infra/fly.toml --dockerfile Dockerfile -a polito-mcp
```

**Secrets (already set on Fly):**
```bash
fly secrets list -a polito-mcp
fly secrets set KEY=value -a polito-mcp   # triggers rolling restart
```

**Logs:**
```bash
fly logs -a polito-mcp --no-tail
```

**SQLite data** lives on volume `polito_mcp_data` mounted at `/data`. Persists across deploys.

---

## MCP tools (15 total)

| Tool | PoliTO endpoint | Notes |
|---|---|---|
| `get_profile` | `GET /me` | Name, degree, credits, averages |
| `get_grades` | `GET /grades` | All recorded exam grades |
| `get_provisional_grades` | `GET /provisional-grades` | Grades pending accept/reject |
| `accept_provisional_grade` | `POST /provisional-grades/:id/accept` | Irreversible |
| `reject_provisional_grade` | `POST /provisional-grades/:id/reject` | Irreversible |
| `list_deadlines` | `GET /deadlines` | fromDate/toDate optional |
| `list_today_lectures` | `GET /lectures` | Filters by today's UTC date |
| `list_courses` | `GET /courses` | Enrolled courses |
| `get_course` | `GET /courses/:id` | Course details |
| `list_messages` | `GET /messages` | PoliTO inbox |
| `mark_message_read` | `PUT /messages/:id/read` | |
| `list_notifications` | `GET /notifications` | Push notifications |
| `list_exams` | `GET /exams` | Available exam sessions |
| `list_bookings` | `GET /bookings` | Active bookings |
| `get_unread_emails_count` | `GET /unreadEmails` | Webmail badge count |
| `delete_my_account` | local + `DELETE /auth/logout` | Wipes DB row + revokes bearer |

---

## PoliTO API notes

- **Spec:** https://github.com/polito/api-spec (TypeSpec → OpenAPI)
- **Auth:** `POST /auth/login` with `loginType: "basic"`, returns `{ data: { token, username, clientId, type } }`
- All data endpoints return `{ data: <payload> }` envelope except `/provisional-grades` which returns `{ data: [], states: [] }` at the top level
- `GET /lectures` accepts `fromDate` / `toDate` query params (YYYY-MM-DD)
- Upstream 401 on any tool call means the stored bearer expired → mark revoked → tell user to re-auth

---

## Connecting MCP clients

**Claude Desktop** (free, recommended for most students):
File: `~/Library/Application Support/Claude/claude_desktop_config.json`
```json
{ "mcpServers": { "polito": { "url": "https://polito-mcp.fly.dev/mcp" } } }
```

**Claude.ai web** (Pro only):
Settings → Integrations → Add custom integration → paste `https://polito-mcp.fly.dev/mcp`

**Cursor / Windsurf:**
File: `~/.cursor/mcp.json` or equivalent
```json
{ "mcpServers": { "polito": { "url": "https://polito-mcp.fly.dev/mcp" } } }
```

---

## Known issues / next debugging tasks

- **Claude Desktop Connectors (Beta) is broken** — OAuth token exchange never completes.
  `POST /token` is never called by Claude.ai's backend after the callback.
  This is an Anthropic-side bug, not ours. Server implementation is correct.
  Workaround: use Cursor (confirmed working) or Claude.ai web (Pro).

- **Auto-deploy via GitHub Actions fails** — `FLY_API_TOKEN` in GitHub secrets
  keeps being rejected ("invalid token"). Current workaround: deploy manually with
  `fly deploy --remote-only --config infra/fly.toml --dockerfile Dockerfile -a polito-mcp`.
  To fix: regenerate token with `fly tokens create deploy -a polito-mcp` and set it
  with `gh secret set FLY_API_TOKEN -R FAZIO11/polito-mcp --body "$(fly tokens create deploy -a polito-mcp)"`.

- **`/.well-known/oauth-protected-resource`** — now implemented (RFC 9728).
  Returns `{ resource, authorization_servers }`. Both `/mcp` and `/mcp`-suffixed
  variants handled.

---

## Ideas for future work

- **Graduation optimizer** — given current credits/grades, compute fastest path to degree
- **Provisional grade advisor** — accept vs reject analysis with GPA impact calculation
- **Smart morning brief** — today's lectures + approaching deadlines + unread messages in one call
- **Calendar export** — `GET /calendar.ics` endpoint serving lectures + deadlines as iCal
- **Telegram/WhatsApp bot** — wrapper for students who won't install a desktop client
- **Announcements tool** — `GET /announcements` endpoint not yet wrapped
- **Token refresh** — PoliTO tokens expire; auto-detect and prompt re-auth gracefully
- **Multi-career support** — some students have multiple careers (`allCareerIds`); `/auth/switch-career` exists in the spec
