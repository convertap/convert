# Contributing to Convert

Read this once before your first pull request. It is short because the detail lives in three documents:

- [`docs/engineering-guardrails.md`](./docs/engineering-guardrails.md) — layout, layer rules, CI gates, conventions
- [`docs/code-review-checklist.md`](./docs/code-review-checklist.md) — what a reviewer checks
- [`docs/definition-of-done.md`](./docs/definition-of-done.md) — when a story is actually finished

Architecture is [`docs/architecture.md`](./docs/architecture.md); product scope is [`docs/mvp-scope.md`](./docs/mvp-scope.md), which wins any disagreement with the pitch-derived spec.

## Current state

The repository holds documentation, the directory skeleton, and the guardrails. **The workspace is not scaffolded yet** — there is no `package.json`, no NestJS app, no Next.js app. The stack is decided (ADR 0001: Next.js, NestJS on Fastify, one worker, one Postgres); the scaffolding is the next task.

Two guardrails already run and need nothing installed:

```bash
python tools/check_boundaries.py            # layer boundaries (gate G1)
python tools/check_boundaries.py --matrix    # print the allowed-dependency matrix
python tools/check_invariant_coverage.py     # every invariant has a test (gate G6)
```

Run the first one before every push. It takes under a second.

## Once the workspace exists

```bash
pnpm install
pnpm dev                 # web, api, and worker together
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm test:integration    # needs a local Postgres
```

## The loop

1. Branch from `main`: `feat/short-description`, `fix/…`, `refactor/…`.
2. Write the test where the logic lives — domain rules in `core` without a database, wiring in integration tests.
3. Run the boundary checker and the test suite locally.
4. Sign the checklist in the pull request template yourself, then request review.
5. One approval from someone who did not write the code. All gates green, none overridden.

Commits follow Conventional Commits — `feat(core/crm): …` — and carry **no agent or tool co-authorship trailers**.

## Things that will get a pull request sent back

Not style opinions. These are the ones that cost real money or real trust:

- A query or table without organization scoping.
- A use case that does not take a `Principal`.
- A provider SDK imported above `packages/infra`.
- Domain logic in a controller or a React component.
- An API change without a regenerated `openapi.json`.
- A guardrail edited to make a red build green, with no ADR.
- Data fetched in a client component when a server component would do.

## Changing a rule

Rules encode decisions, and decisions get superseded. Open an ADR under `docs/adr/` that supersedes the old one, change the rule in the same commit, and name the ADR in the pull request. CI gate G2 enforces the pairing.

## Asking for a decision

Some things are not yours to decide: pricing, scope, provider choice, and the open items in [`docs/pre-development-checklist.md`](./docs/pre-development-checklist.md). If you are blocked on one, cite its ID (`R3`, `E3`, `A1`) rather than guessing — a guess that lands in the schema is expensive to reverse.
