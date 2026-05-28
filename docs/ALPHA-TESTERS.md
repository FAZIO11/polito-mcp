# For alpha testers

Thank you for trying polito-mcp. This is an unofficial, open-source MCP bridge
that lets MCP-aware tools (Cursor, Claude Desktop, Codex, etc.) talk to your
Politecnico di Torino student account.

## What you should know before signing in

1. **This is not Politecnico di Torino.** It is a personal project by a fellow
   PoliTO student. Source: <https://github.com/FAZIO11/polito-mcp>.
2. When you sign in, your matricola and PoliTO password are sent over TLS to
   our server, immediately forwarded to PoliTO's official `/auth/login`
   endpoint, and the password is discarded from memory.
3. The API token PoliTO returns is encrypted at rest with a per-user key.
4. You can wipe your data at any time with the `delete_my_account` tool, or
   `DELETE /me/data` from your client.
5. If anything breaks or feels wrong, file an issue or DM the maintainer.

## Setup (5 minutes)

### Cursor

`Cursor → Settings → MCP → Add`

```jsonc
{
  "polito": { "url": "https://polito-mcp.example/mcp" }
}
```

### Claude Desktop

`Settings → Developer → Edit config file`, add to `mcpServers`:

```jsonc
"polito": { "url": "https://polito-mcp.example/mcp" }
```

### What to try

- "Show my next 5 deadlines."
- "Summarise my unread PoliTO messages."
- "What lectures do I have today?"
- "What's my current weighted average and how many credits do I still need to graduate?"
- "List my courses and group them by semester."

### What we'd love to know

Fill out [`docs/FEEDBACK.md`](FEEDBACK.md) or open an issue with the same
fields. Even one-line answers help:

- Did the sign-in flow work? Anything confusing?
- Which tool answer was most useful?
- Which tool answer was wrong or confusing?
- What did you wish you could do but couldn't?
- Anything that would have made you NOT use this if you'd seen it earlier?

## What we will measure during alpha

- Number of unique signed-in users (no PII collected beyond the matricola)
- Tool call volume per tool
- Upstream 4xx/5xx rate from PoliTO per endpoint
- p95 tool latency

Nothing else. No telemetry on prompts, conversations, or results.
