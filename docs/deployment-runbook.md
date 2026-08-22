# Deployment runbook

Last updated: 22 August 2026.

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

**`DATABASE_URL` is the credential with unrestricted read, by design (ADR 0052).** Its role must be
able to bypass row-level security — superuser, or holding `BYPASSRLS` — because a migration operates
on every tenant's rows by definition, and every row-scoped table is `FORCE ROW LEVEL SECURITY`, which
removes the owner's exemption. An ordinary owner therefore makes a backfill affect zero rows while
reporting success, which under forward-only migrations is the worst available failure. G7 asserts the
attribute rather than assuming it, so pointing `DATABASE_URL` at a restricted role fails the build
with the reason named. Treat that credential accordingly: it is the highest-blast-radius secret in
the system, it belongs in Infisical (ADR 0020), and nothing but bootstrap and migrations uses it.

## Deploy

1. Merge feature pull requests to `develop`. This runs every gate and does not deploy.
2. Promote with pull requests in order: `develop` -> `testing` -> `staging` -> `main`. Do not skip
   a branch or push directly to a long-lived branch. Merge promotion PRs with **Create a merge
   commit**; squash and rebase are only for feature PRs into `develop`.
3. A merge to `testing` deploys Railway `test` when `DEPLOY_TEST=true`. A merge to `staging`
   deploys Railway `staging` when `DEPLOY_STAGING=true`. A merge to `main` records the production
   release; production deployment is not configured yet.
   The PR to `staging` requires successful test deployment checks for both services on its source
   commit; the PR to `main` requires the corresponding staging checks.
4. The API pre-deploy phase runs role bootstrap and then every Drizzle migration. A failure stops
   the deployment before traffic changes.

   **It is one command, and it has to stay one.** `railway.schema.json` allows
   `deploy.preDeployCommand` to be a string, or an array of **at most one** element. From PR #46
   until 22 August 2026 `apps/api/railway.json` held an array of two, so Railway rejected the config
   and failed every api deployment *before building* — four consecutive failures, no build log, and
   the CLI reporting only `Deploy failed`. `@convert/web` was unaffected because it has no pre-deploy
   command, which is what made it look like an api problem rather than a config one. The two steps
   now live in the `pre-deploy` script of `@convert/infra`, so ordering stays explicit and the
   Railway field stays a single string. If a third step is ever needed, it goes in that script, never
   into the array.
5. Railway waits for `/ready`, which executes `select 1` through `DATABASE_URL_APP`.
6. GitHub probes the same readiness URL after `railway up` returns.

### One-time branch bootstrap

Complete this before the workflow change in ADR 0049 is merged:

1. Fast-forward `develop` to the current `main` tip. This is the one-time baseline alignment; do
   not merge `main` backward after the promotion guardrail is active.
2. Create `testing` and `staging` from that aligned `develop` tip.
3. Make `develop` the GitHub default branch so new and automated pull requests target integration;
   `main` remains the production release branch.
4. Enable squash merges and merge commits in repository settings. Require linear history on
   `develop`, but not on `testing`, `staging`, or `main`.
5. Protect all four branches with the four required CI jobs, strict checks, administrator
   enforcement, resolved conversations, and blocked force pushes and deletion.
6. Restrict GitHub environment `test` to branch `testing` and environment `staging` to branch
   `staging`.
7. Land the workflow change through a feature PR to `develop`, then promote it through each branch
   with merge commits. That first promotion proves the route before product development uses it.

The worker is not deployed until it has a durable handler and shutdown behavior. The web service
has no database pre-deploy command.

## Migration rules

- Migrations are forward-only in deployment. Never edit a migration that has run remotely.
- Make destructive changes expand-and-contract: deploy compatible additions first, backfill,
  switch application reads/writes, then remove old structures in a later deployment.
- A migration must be compatible with the currently running application because pre-deploy runs
  before Railway switches traffic to the new process.
- Bootstrap is idempotent and runs before every migration batch.

## The Postgres version

Every environment runs the Postgres major named in `.postgres-version`, and gate G16 holds the six
declarations inside this repository to it (ADR 0053). **G16 cannot see Railway.** The Postgres
service's image tag is a seventh copy of that number, owned by Railway's template rather than by any
file here, so it is checked by a person:

```bash
railway ssh --service Postgres --environment test -- psql -c 'select version()'
```

Do that as part of the weekly reconciliation, alongside the Notion checks. If the tag has moved to a
new major, that is a decision, not a bump: it changes what every RLS and enum proof was measured
against, so it needs a record of its own.

## Rollback

Redeploy the last known-good application artifact from Railway or rerun its commit through CI.
Application rollback does not reverse database migrations. If a migration caused the incident,
ship a new forward repair migration; restore from the managed Postgres backup only for confirmed
data loss or corruption, with writes stopped first.

After rollback, verify `/health`, `/ready`, and the affected workflow. Record the failed migration,
repair, and any data reconciliation required before reopening traffic.
