# Deployment

The hosted version runs on [Fly.io](https://fly.io) in the `fra` (Frankfurt,
EU) region. Data lives on a single persistent volume mounted at `/data`.

## One-time setup

```bash
fly auth login
fly launch --no-deploy --name polito-mcp --region fra
fly volumes create polito_mcp_data --region fra --size 1

# Generate secrets
fly secrets set \
  ENC_MASTER_KEY="$(openssl rand -hex 32)" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  POLITO_BASE_URL="https://app.didattica.polito.it" \
  PUBLIC_ORIGIN="https://polito-mcp.example"

# Optional
fly secrets set SENTRY_DSN="..."
```

## Custom domain + HSTS preload

1. Point a CNAME from your domain to `polito-mcp.fly.dev`.
2. `fly certs add polito-mcp.example`
3. Update `PUBLIC_ORIGIN` to match: `fly secrets set PUBLIC_ORIGIN="https://polito-mcp.example"`
4. Verify HSTS is being sent: `curl -sI https://polito-mcp.example/ | grep -i strict`
5. Once stable for 14 days, submit to https://hstspreload.org/.

## Deploys

`main` is auto-deployed by [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
on every push, gated by passing CI. Manual deploys: `flyctl deploy --remote-only --config infra/fly.toml --dockerfile Dockerfile`.

## Backups

`fly volumes snapshots list polito_mcp_data` — Fly keeps daily snapshots
automatically. Restore with `fly volumes snapshots create` / `fly machine clone`.

## Threat model reminder

A breach of this server yields the encrypted bearer tokens of every signed-in
user (not their passwords — those never touch disk). To make those tokens
usable an attacker would also need the `ENC_MASTER_KEY` Fly secret. Rotate
that key by:

1. Set new key with `fly secrets set ENC_MASTER_KEY_NEXT=...`.
2. Deploy a build that supports dual-read with HKDF-based key rolling.
3. Re-encrypt rows in a one-shot job.

(That rotation tooling is not yet in v1; raise an issue if you need it.)
