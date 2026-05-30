---
layout: ../../layouts/DocsLayout.astro
title: Connecting clients
description: Per-client setup for Claude Desktop, Claude.ai, Cursor, Windsurf and VS Code.
---

# Connecting clients

The server URL is the same everywhere:

```
https://polito-mcp.fly.dev/mcp
```

Below is where to put it for each client.

## Claude Desktop

Edit your config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "polito": {
      "url": "https://polito-mcp.fly.dev/mcp"
    }
  }
}
```

Save and restart Claude Desktop.

## Claude.ai (web — Pro)

Go to **Settings → Connectors → Add custom connector** and paste the URL:

```
https://polito-mcp.fly.dev/mcp
```

## Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "polito": {
      "url": "https://polito-mcp.fly.dev/mcp"
    }
  }
}
```

## Windsurf

Add the same `mcpServers` block to Windsurf's MCP config, then reload.

## VS Code (Copilot MCP)

Add the server to your MCP settings using the URL above. Reload the window so the
tools register.

## After connecting

On the first tool call, your client opens the PoliTO login page automatically. Sign in
once and you're set — see the **[Quickstart](/docs/quickstart/)** for what happens next.
