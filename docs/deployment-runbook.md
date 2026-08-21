# Deployment runbook

Last updated: 21 August 2026.

## Required variables

Configure these on the API service in each Railway environment:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Owner connection used only by bootstrap and migrations |
| `APP_DB_PASSWORD` | Password bootstrap assigns to `convert_app` |
| `DATABASE_URL_APP` | Runtime connection for `convert_app`; RLS applies to it |
| `RAILWAY_TOKEN` | GitHub environment secret used by the deploy job |

`APP_DB_PASSWORD` and the password embedded in `DATABASE_URL_APP` must match. The application
refuses to fall back to `DATABASE_URL`.

## Deploy

1. Merge to `develop` for test or `main` for staging after all gates pass.
2. Enable the corresponding `DEPLOY_TEST` or `DEPLOY_STAGING` GitHub environment variable.
3. The API pre-deploy phase runs role bootstrap and then every Drizzle migration. A failure stops
   the deployment before traffic changes.
4. Railway waits for `/ready`, which executes `select 1` through `DATABASE_URL_APP`.
5. GitHub probes the same readiness URL after `railway up` returns.

The worker is not deployed until it has a durable handler and shutdown behavior. The web service
has no database pre-deploy command.

## Migration rules

- Migrations are forward-only in deployment. Never edit a migration that has run remotely.
- Make destructive changes expand-and-contract: deploy compatible additions first, backfill,
  switch application reads/writes, then remove old structures in a later deployment.
- A migration must be compatible with the currently running application because pre-deploy runs
  before Railway switches traffic to the new process.
- Bootstrap is idempotent and runs before every migration batch.

## Rollback

Redeploy the last known-good application artifact from Railway or rerun its commit through CI.
Application rollback does not reverse database migrations. If a migration caused the incident,
ship a new forward repair migration; restore from the managed Postgres backup only for confirmed
data loss or corruption, with writes stopped first.

After rollback, verify `/health`, `/ready`, and the affected workflow. Record the failed migration,
repair, and any data reconciliation required before reopening traffic.
