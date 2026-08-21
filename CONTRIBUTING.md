# Contributing to Convert

Read this once before your first pull request. It is short because the detail lives in three documents:

- [`docs/engineering-guardrails.md`](./docs/engineering-guardrails.md). Layout, layer rules, CI gates, conventions
- [`docs/code-review-checklist.md`](./docs/code-review-checklist.md), what a reviewer checks
- [`docs/definition-of-done.md`](./docs/definition-of-done.md). When a story is actually finished

Architecture is [`docs/architecture.md`](./docs/architecture.md); product scope is [`docs/mvp-scope.md`](./docs/mvp-scope.md), which wins any disagreement with the pitch-derived spec.

## Current state

The workspace is scaffolded and the api boots. `apps/api`, `apps/web` and `apps/worker` exist alongside `packages/contracts`, `core`, `application` and `infra`, and fifteen guardrails run in CI.

**There is no schema and there are no migrations.** `packages/infra/src/db/schema.ts` holds `workspace` and nothing else, and `TENANT_TABLES` is empty. That is deliberate, not unfinished: the product rules that decide the shape of contact, lead and deal are settled but not yet turned into tables, which is what the *Schema and migration plan* effort is for. Two consequences for you: `pnpm test:integration` has nothing to run, and the G9 performance budget is trivially met because `apps/web` is a placeholder.

Two guardrails run without installing anything:

```bash
python tools/check_boundaries.py            # layer boundaries (gate G1)
python tools/check_boundaries.py --matrix    # print the allowed-dependency matrix
python tools/check_invariant_coverage.py     # every invariant has a test (gate G6)
```

Run the first one before every push. It takes under a second.

## Secrets

Infisical holds them; nothing lives in a file (ADR 0020). Once per machine:

```bash
infisical login
infisical init           # links this directory to the Infisical project
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

```bash
pnpm db:up                                    # Postgres 16 in Docker, from docker-compose.yml
infisical run --env=dev -- pnpm --filter @convert/infra bootstrap   # creates convert_app
infisical run --env=dev -- pnpm db:assert-rls                       # proves RLS applies to it
infisical run --env=dev -- pnpm --filter @convert/infra assert:conventions
```

`bootstrap` is what creates the application role. Skip it and `assert:rls` fails saying the role does not exist, which is the intended message rather than a puzzle.

**`infisical run` is how a process gets its environment.** Exporting `.env.local` does *not* feed the api or the worker: neither initialises `dotenv`, by design under ADR 0020. If you must work offline, export the file and then either source it into your shell or pass it with `node --env-file`; do not expect a process to find it on its own.

## The loop

1. Branch from `main`: `feat/short-description`, `fix/…`, `refactor/…`. **`main` is protected, nobody pushes to it directly, including administrators.**
2. Write the test where the logic lives, domain rules in `core` without a database, wiring in integration tests.
3. Commit. The `commit-msg` hook enforces Conventional Commits and rejects agent co-authorship trailers.
4. Push. The `pre-push` hook runs the boundary, invariant, and contrast checks.
5. Open a pull request and sign the checklist in the template yourself.
6. All four CI jobs green, branch up to date with `main`, conversations resolved. Squash merge; the branch deletes itself.

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
