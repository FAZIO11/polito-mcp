# Privacy

This document is a plain-English description of what data this service stores,
where it lives, for how long, and how to delete it. The source of truth is the
code in [`apps/server/src`](apps/server/src) — read it.

## What we store

For every user that has authenticated at least once:

| Field                    | Purpose                                            | Lifetime                         |
| ------------------------ | -------------------------------------------------- | -------------------------------- |
| `user_id` (random UUID)  | Stable internal identifier                         | Until account deletion           |
| `polito_username`        | Display name for the consent screen                | Until account deletion           |
| `polito_client_id`       | Required by PoliTO for `switch-career` / `logout`  | Until account deletion           |
| `polito_token_ct`        | AES-256-GCM ciphertext of the PoliTO bearer token  | Until token expires or revoked   |
| `created_at`, `last_seen`| Diagnostics, rate limiting                         | Until account deletion           |

For every active OAuth grant:

| Field                | Purpose                                  | Lifetime                |
| -------------------- | ---------------------------------------- | ----------------------- |
| `client_id`          | The MCP client that asked for access     | Until grant revoked     |
| `redirect_uri`       | Validated against client registration    | Until grant revoked     |
| `code` (transient)   | OAuth authorization code                 | ≤ 60 seconds            |
| Issued JWTs          | We don't store JWTs; they're stateless   | n/a                     |

For every dynamically-registered MCP client (RFC 7591):

| Field                | Purpose                                   | Lifetime               |
| -------------------- | ----------------------------------------- | ---------------------- |
| `client_id`          | Generated for the client                  | Until manual deletion  |
| `client_name`        | Display name                              | Until manual deletion  |
| `redirect_uris`      | Allow-list for OAuth callbacks            | Until manual deletion  |

## What we do not store

- **Your PoliTO password.** Held in memory for one HTTPS POST, then
  overwritten and discarded.
- **Request or response bodies** from PoliTO API calls.
- **IP addresses**, beyond an in-memory counter for rate-limiting (no
  persistence).
- **Analytics, telemetry, or ad-tracking** of any kind.

## Where it lives

- Production data: SQLite database file on a persistent volume in Fly.io's
  `fra` (Frankfurt, EU) region.
- Backups: encrypted volume snapshots, retained ≤ 7 days.
- Error reports: Sentry, EU-resident project, with request body redaction.

## How to delete your data

While signed in, call the MCP tool `delete_my_account`, or hit
`DELETE /me/data` with your JWT. Both:

1. Call upstream `DELETE /auth/logout` to revoke the bearer at PoliTO.
2. Wipe the encrypted token row and the user record.
3. Invalidate any outstanding JWTs for that subject.

This is irreversible.

## Contact

For privacy questions please open an issue on the repository or contact the
operator listed in the repository README.
