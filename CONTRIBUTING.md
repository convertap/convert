# Contributing to Convert

Read this once before your first pull request. It is short because the detail lives in three documents:

- [`docs/engineering-guardrails.md`](./docs/engineering-guardrails.md). Layout, layer rules, CI gates, conventions
- [`docs/code-review-checklist.md`](./docs/code-review-checklist.md), what a reviewer checks
- [`docs/definition-of-done.md`](./docs/definition-of-done.md). When a story is actually finished

Architecture is [`docs/architecture.md`](./docs/architecture.md); product scope is [`docs/mvp-scope.md`](./docs/mvp-scope.md), which wins any disagreement with the pitch-derived spec.

## Prerequisites

- Node.js 22 and Corepack-enabled pnpm 11
- Docker with Compose for local PostgreSQL 18 <!-- pg-version -->
- Python 3.12 for repository guardrails
- Infisical CLI only when using shared secrets or the Notion mirror

## Current state

The workspace is scaffolded and the api boots. `apps/api`, `apps/web` and `apps/worker` exist alongside `packages/contracts`, `core`, `application` and `infra`, and sixteen guardrails run in CI.

**There is no schema and there are no migrations.** `packages/infra/src/db/schema.ts` holds `workspace` and nothing else, and `TABLE_ACCESS` in `packages/infra/src/db/access.ts` classifies that one table and no others. That is deliberate, not unfinished: the product rules that decide the shape of contact, lead and deal are settled but not yet turned into tables, which is what the *Schema and migration plan* effort is for. Two consequences for you: `pnpm test:integration` has nothing to run, and the G9 performance budget is trivially met because `apps/web` is a placeholder.

Two guardrails run without installing anything:

```bash
python tools/check_boundaries.py            # layer boundaries (gate G1)
python tools/check_boundaries.py --matrix    # print the allowed-dependency matrix
python tools/check_invariant_coverage.py     # every invariant has a test (gate G6)
```

Run the first one before every push. It takes under a second.

## Secrets

Production secrets belong in Infisical; nothing secret belongs in git (ADR 0020). At present the
shared project contains `NOTION_TOKEN`, not the local database credentials. For local Postgres,
set the three database variables in your shell from the values below; use Infisical once managed
environment credentials have been provisioned. Once per machine:

```bash
infisical login
infisical init           # only if the committed project link is unavailable
```

Then prefix anything that needs a secret:

```bash
infisical run --env=dev -- pnpm dev
infisical run --env=dev -- claude    # so the Notion MCP server inherits NOTION_TOKEN
```

Forgetting the prefix produces a missing-variable error rather than an obvious "you forgot the wrapper", so check for it first when a process cannot find its configuration. If you need to work offline, `infisical export --env=dev > .env.local` and delete the file afterwards. `.gitignore` blocks it, and the `pre-commit` hook scans staged changes for credentials regardless.

## Once the workspace exists

```bash
pnpm install
pnpm dev                 # web, api, and worker together
pnpm typecheck           # builds the workspace packages first, then checks the apps
pnpm lint                # --max-warnings=0, so a warning fails it (gate G4)
pnpm test
pnpm test:integration    # needs a local Postgres; nothing to run until migrations exist
pnpm guardrails          # boundaries, invariant coverage, token contrast
```

### A database, from nothing

The api and worker connect as `convert_app`, never as the owner (ADR 0042), so they need **both** connection strings present and will refuse to start on the wrong one.

Three variables, and the two passwords must match. **These values are local throwaways and belong
nowhere but a laptop** — a deployed environment takes them from Infisical, and `DATABASE_URL_APP`
there carries a real password (ADR 0020, `docs/deployment-runbook.md`).

```bash
export DATABASE_URL='postgres://convert:convert@localhost:5432/convert'
export APP_DB_PASSWORD='convert-app-local'
export DATABASE_URL_APP='postgres://convert_app:convert-app-local@localhost:5432/convert'
```

PowerShell, since the maintainer's machine is Windows:

```powershell
$env:DATABASE_URL='postgres://convert:convert@localhost:5432/convert'
$env:APP_DB_PASSWORD='convert-app-local'
$env:DATABASE_URL_APP='postgres://convert_app:convert-app-local@localhost:5432/convert'
```

Then, in order:

```bash
pnpm db:up                                    # Postgres 18 in Docker, from docker-compose.yml
pnpm --filter @convert/infra bootstrap        # creates convert_app; idempotent, safe to rerun
pnpm db:migrate                               # currently reports that there is nothing to apply
pnpm db:assert-rls                            # proves RLS applies to the application role
pnpm --filter @convert/infra assert:conventions
```

**If you worked on this repository before 22 August 2026**, you have a Compose volume holding a
Postgres 16 cluster. <!-- pg-version:historical=16 --> Postgres 18 will not start on it, because the data directory layout is
version-specific, so `docker-compose.yml` now uses a separate `convert-pgdata-18` volume mounted at
`/var/lib/postgresql`, which is where the 18 image declares its volume. The old one is left alone.

Compose prefixes volume names with the project, so the old volume is usually
`project_convert-pgdata` rather than `convert-pgdata`, so find yours with
`docker volume ls --filter name=convert`. Nothing in this repository needs migrating out of it,
because there is no schema yet, but only you know whether you put anything in it by hand. Inspect it
before removing it, and delete by its real name.


`bootstrap` is what creates the application role. Skip it and `assert:rls` fails saying the role does not exist, which is the intended message rather than a puzzle.

Deployment variables, pre-deploy migrations, verification and rollback are documented in
[`docs/deployment-runbook.md`](./docs/deployment-runbook.md).

**`infisical run` is how a process gets its environment.** Exporting `.env.local` does *not* feed the api or the worker: neither initialises `dotenv`, by design under ADR 0020. If you must work offline, export the file and then either source it into your shell or pass it with `node --env-file`; do not expect a process to find it on its own.

## The loop

1. Branch from `develop`: `feat/short-description`, `fix/…`, `refactor/…`. **All four long-lived branches are protected; nobody pushes to them directly, including administrators.**
2. Write the test where the logic lives, domain rules in `core` without a database, wiring in integration tests.
3. Commit. The `commit-msg` hook enforces Conventional Commits and rejects agent co-authorship trailers.
4. Push. The `pre-push` hook runs the boundary, invariant, and contrast checks.
5. Open a pull request and sign the checklist in the template yourself.
6. All four CI jobs green, branch up to date with `develop`, conversations resolved. Squash merge
   feature work; the feature branch deletes itself.

Releases move only through promotion pull requests: `develop` -> `testing` -> `staging` -> `main`.
Merging to `develop` runs CI without deploying. Merging to `testing` deploys Railway `test`; merging
to `staging` deploys Railway `staging`; merging to `main` records the production release. There is
no production deploy job until a production Railway environment and its approval policy exist.
Promotion pull requests use **Create a merge commit**, never squash or rebase, so the promoted
branch remains an ancestor of the next release. A promotion to `staging` cannot merge until both
Railway `test` deployment checks succeeded on the `testing` commit; promotion to `main` likewise
requires both Railway `staging` checks on the `staging` commit.

Approvals are currently set to zero because a solo maintainer cannot approve their own pull request. That rises to one the day a second developer joins, everything else in the protection rules applies from today.

Commits follow Conventional Commits, `feat(core/crm): …`, and carry **no agent or tool co-authorship trailers**.

## Things that will get a pull request sent back

Not style opinions. These are the ones that cost real money or real trust:

- A query or table without workspace scoping.
- A use case that does not take a `Principal`.
- A provider SDK imported above `packages/infra`.
- Domain logic in a controller or a React component.
- An API change without a regenerated `openapi.json`.
- A guardrail edited to make a red build green, with no ADR.
- Data fetched in a client component when a server component would do.

## Changing a rule

Rules encode decisions, and decisions get superseded. Open an ADR under `docs/adr/` that supersedes the old one, change the rule in the same commit, and name the ADR in the pull request. CI gate G2 enforces the pairing.

## Asking for a decision

Some things are not yours to decide: pricing, scope, provider choice, and the open items in [`docs/pre-development-checklist.md`](./docs/pre-development-checklist.md). If you are blocked on one, cite its ID (`R3`, `E3`, `A1`) rather than guessing, a guess that lands in the schema is expensive to reverse.
