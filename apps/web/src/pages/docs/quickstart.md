---
layout: ../../layouts/DocsLayout.astro
title: Quickstart
description: Connect an MCP client to polito-mcp in three steps.
---

# Quickstart

Connect any MCP-compatible client in three steps. No package to install, no API key.

## 1. Add the server

Add polito-mcp to your client's MCP configuration. The endpoint is:

```
https://polito-mcp.fly.dev/mcp
```

For most clients the config looks like this:

```json
{
  "mcpServers": {
    "polito": {
      "url": "https://polito-mcp.fly.dev/mcp"
    }
  }
}
```

See **[Connecting clients](/docs/clients/)** for the exact file path per client.

## 2. Restart your client

Restart (or reload) the client so it picks up the new server. You should see
`polito` appear in its list of connected tools.

## 3. Sign in once

On your first request, the client opens a hardened PoliTO login page. Sign in with
either format:

- `s334745@studenti.polito.it` — your student email, **or**
- `s334745` — just your matricola

Your credentials go straight to PoliTO's official login endpoint. Your password is
**never stored** and is wiped from memory immediately after sign-in. Only the resulting
API token is kept, encrypted at rest.

## You're connected

Try one of these:

> What lectures do I have today?

> What's my weighted average right now?

> Anything due this week?

If a request ever returns an authentication error, your PoliTO token has expired —
just trigger any tool again and you'll be prompted to sign back in.
