---
layout: ../../layouts/DocsLayout.astro
title: Overview
description: What polito-mcp is, who it's for, and how the pieces fit together.
---

# Overview

**polito-mcp** is an open-source [Model Context Protocol](https://modelcontextprotocol.io)
server that connects AI clients — Claude Desktop, Cursor, Windsurf, VS Code — to the
[Politecnico di Torino student API](https://github.com/polito/api-spec).

Once connected, you can ask your assistant about your real account in plain language:
your grades and averages, today's lectures, approaching deadlines, course materials,
exam sessions, free study rooms, and more. The assistant calls the right tools behind
the scenes and gives you a precise, live answer.

> **Unofficial.** This project is not affiliated with, endorsed by, or sponsored by
> Politecnico di Torino. It references the university name only to identify the
> upstream API it consumes.

## Why it exists

The PoliTO portal holds everything a student needs — but it's spread across pages,
tabs, and apps. polito-mcp turns all of it into a single conversational surface, so
"what's my morning look like?" returns one coherent answer instead of three logins.

## How it fits together

```
MCP client  →  POST /mcp (Bearer token)
            →  MCP tool handler
            →  decrypts your stored PoliTO token
            →  https://app.didattica.polito.it/api/...
            ←  live data, formatted by your assistant
```

The server speaks the standard MCP **Streamable HTTP** transport with OAuth 2.1 + PKCE
and dynamic client registration, so any spec-compliant client connects with just a URL.

## What's next

- **[Quickstart](/docs/quickstart/)** — connect your first client in under a minute.
- **[Connecting clients](/docs/clients/)** — per-client config for Claude, Cursor, and more.
- **[Tools](/docs/tools/)** — the full list of what the assistant can do.
- **[Security & privacy](/docs/security/)** — exactly what's stored, and how it's protected.
