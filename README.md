# polito-mcp

> **UNOFFICIAL.** This project is **not** affiliated with, endorsed by, or
> sponsored by Politecnico di Torino. It does not use any PoliTO trademark
> beyond a neutral textual reference to identify the upstream API it consumes.
>
> **What you are agreeing to if you sign in:** your matricola and password are
> sent over TLS to this server. The server immediately forwards them to
> PoliTO's official `/auth/login` endpoint and discards the password from
> memory. Only the resulting bearer API token is kept (encrypted at rest) so
> that future MCP requests can call the PoliTO API on your behalf.
>
> If that trust model is not acceptable to you, **do not use this service**.
> The source code is open so you can verify the behavior yourself: see
> [`apps/server/src/auth/password.ts`](apps/server/src/auth/password.ts).

Remote [Model Context Protocol](https://modelcontextprotocol.io) server that
wraps the [Politecnico di Torino student API](https://github.com/polito/api-spec)
so that MCP-aware clients (Cursor, Claude Desktop, Codex, the ChatGPT Apps
ecosystem, etc.) can read your profile, grades, deadlines, lectures, courses,
messages, exams and bookings and perform a small number of safe writes.

## Status

v0.1 — hosted password-form auth (Option 3 with hardening). The auth layer is
pluggable; when (and if) PoliTO ever registers a third-party `redirect_uri`
for us, the same MCP tools will work behind real SSO without changes.

## Stack

- TypeScript end-to-end, Node 20+.
- [Hono](https://hono.dev) HTTP server.
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
  Streamable HTTP transport.
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for persistence,
  AES-256-GCM with per-user HKDF keys for token encryption at rest.
- [Pino](https://getpino.io) with strict allow-list redaction + a CI test
  that fails the build if a synthetic password ever appears in logs.

## Layout

```
polito-mcp/
├── apps/server/      # The Hono + MCP server
└── infra/            # Fly.io config
```

## Quick start (local development)

```bash
npm install
cp apps/server/.env.example apps/server/.env
# generate strong secrets
node -e 'console.log("ENC_MASTER_KEY="+require("node:crypto").randomBytes(32).toString("hex"))'
node -e 'console.log("JWT_SECRET="+require("node:crypto").randomBytes(32).toString("hex"))'
# paste the two lines into apps/server/.env, set POLITO_BASE_URL to the mock or real PoliTO API
npm run dev
```

The MCP endpoint is `http://localhost:8787/mcp`. OAuth discovery is at
`http://localhost:8787/.well-known/oauth-authorization-server`.

## Connecting an MCP client

The server speaks the standard MCP Streamable HTTP transport with OAuth 2.1 +
PKCE + RFC 7591 dynamic client registration, so any spec-compliant MCP client
can connect by entering only the URL.

**Cursor / Claude Desktop / Codex** — add the remote MCP server:

```jsonc
{
  "mcpServers": {
    "polito": {
      "url": "https://polito-mcp.example/mcp"
    }
  }
}
```

On first call, your client opens the authorize URL, you sign in on the
hardened login page, and an access token is stored locally by the client.

## Deployment

See [`infra/README.md`](infra/README.md) for the Fly.io deployment steps,
custom domain + HSTS preload, and key-rotation guidance.

## Alpha testing & PoliTO outreach

- [`docs/ALPHA-TESTERS.md`](docs/ALPHA-TESTERS.md) — what to tell early users.
- [`docs/FEEDBACK.md`](docs/FEEDBACK.md) — copy-paste feedback template.
- [`docs/POLITO-OUTREACH-DRAFT.md`](docs/POLITO-OUTREACH-DRAFT.md) — pre-drafted
  letter to file with the PoliTO maintainers after we have real adoption data.

## Security

See [SECURITY.md](SECURITY.md) for the threat model, mitigations, and how to
report a vulnerability.

## Privacy

See [PRIVACY.md](PRIVACY.md) for exactly what is stored, where, for how long,
and how to delete it.

## License

[AGPL-3.0-or-later](LICENSE). Forks and re-hosters must keep their source open.
That is intentional: auditability is the entire trust story.
