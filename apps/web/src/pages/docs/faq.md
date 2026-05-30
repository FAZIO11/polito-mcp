---
layout: ../../layouts/DocsLayout.astro
title: FAQ
description: Common questions about polito-mcp.
---

# FAQ

## Is this official?

No. polito-mcp is an independent, open-source project built by a student. It is not
affiliated with, endorsed by, or sponsored by Politecnico di Torino. It references the
university name only to identify the upstream API it consumes.

## Do you store my password?

No. Your password is forwarded once to PoliTO's official login endpoint over TLS, then
wiped from memory. Only the resulting API token is kept, encrypted at rest. See
**[Security & privacy](/docs/security/)**.

## Do I need to pay or get an API key?

No. There's no API key and nothing to pay for. You connect with a single URL and sign in
with your existing PoliTO credentials.

## Which clients work?

Any spec-compliant MCP client over Streamable HTTP — including Claude Desktop, Claude.ai
(Pro), Cursor, Windsurf, and VS Code with MCP support. See
**[Connecting clients](/docs/clients/)**.

## Can I log in with my matricola instead of my email?

Yes. Both `s334745` and `s334745@studenti.polito.it` work — they normalise to the same
matricola before reaching PoliTO.

## What happens when my session expires?

PoliTO tokens expire periodically. When that happens, the next tool call returns an
authentication error and your client re-opens the login page. Just sign in again.

## How do I delete my data?

Ask your assistant to delete your account, or call the account-deletion endpoint. It
removes your stored row and encrypted token and revokes the upstream token immediately.
Nothing is retained.

## Can I self-host it?

Yes — the source is on [GitHub](https://github.com/FAZIO11/polito-mcp) under AGPL-3.0.
Note the license requires re-hosters to keep their source open, which is intentional:
auditability is the entire trust story.

## Something's broken or missing. Where do I report it?

Open an issue on the [repository](https://github.com/FAZIO11/polito-mcp/issues). Feature
requests are welcome too — see the **[Roadmap](/docs/roadmap/)** for what's already planned.
