---
layout: ../../layouts/DocsLayout.astro
title: Security & privacy
description: The threat model — what's stored, how it's protected, and how to delete it.
---

# Security & privacy

You're connecting a real student account, so this page is specific about what happens
to your data. The full source is public under AGPL-3.0 — you can verify every claim here.

## What you agree to when you sign in

Your matricola and password are sent over TLS to this server. The server **immediately
forwards them** to PoliTO's official `/auth/login` endpoint and **discards the password
from memory**. Only the resulting bearer API token is kept, encrypted at rest, so future
requests can call the PoliTO API on your behalf.

If that trust model isn't acceptable to you, don't use the service — and because the
code is open, you can audit exactly how credentials are handled before deciding.

## How your token is protected

- **Encryption at rest.** The PoliTO bearer token is sealed with **AES-256-GCM**.
- **Per-user keys.** The encryption key is derived per user via **HKDF** from a master
  key, so a single leaked key can't unlock every account, and a raw database dump
  reveals nothing usable.
- **Short-lived access tokens.** The token your client receives is a separate, signed,
  short-lived credential — not your PoliTO token.

## Logs never contain secrets

Logging uses a strict **allow-list redaction** policy, and a continuous-integration test
**fails the build** if a synthetic password ever appears in log output. Secrets can't
leak into logs by accident because the build won't ship if they do.

## Deleting your data

The `delete_my_account` tool — or the account-deletion endpoint — does two things:

1. Removes your row and encrypted token from the database.
2. Revokes the bearer token upstream via PoliTO logout.

There's no retention period and no recovery step. Once deleted, it's gone.

## Reporting a vulnerability

Found something? Please open a private report on the
[GitHub repository](https://github.com/FAZIO11/polito-mcp). See `SECURITY.md` in the
repo for the disclosure process and threat model in full.
