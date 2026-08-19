# Architecture Decision Records

One file per decision. Numbered, immutable once accepted, superseded rather than edited. The point is that six months from now the reasoning is recoverable. Including the alternatives that were rejected, which is the part memory loses first.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](./0001-nextjs-web-nestjs-on-fastify-api-and-a-worker-in-one-monorep.md) | Next.js web, NestJS on Fastify API, and a worker in one monorepo | Accepted |
| [0002](./0002-postgresql-row-level-security-as-the-tenancy-boundary.md) | PostgreSQL row-level security as the tenancy boundary | Proposed |
| [0003](./0003-principal-abstraction-covering-sessions-api-clients-and-the.md) | Principal abstraction covering sessions, API clients, and the worker | Proposed |
| [0004](./0004-ulid-external-identifiers.md) | ULID external identifiers | Proposed |
| [0005](./0005-provider-agnostic-messaging-ports.md) | Provider-agnostic messaging ports | Proposed |
| [0006](./0006-unified-bidirectional-message-record-with-forward-only-statu.md) | Unified bidirectional message record with forward-only status | Proposed |
| [0007](./0007-derived-conversation-window-state-surfaced-in-the-ui.md) | Derived conversation-window state, surfaced in the UI | Proposed |
| [0008](./0008-consent-as-an-append-only-record.md) | Consent as an append-only record | Proposed |
| [0009](./0009-append-only-activity-log-distinct-from-system-audit.md) | Append-only activity log, distinct from system audit | Proposed |
| [0010](./0010-postgres-backed-job-queue-rather-than-a-redis-broker.md) | Postgres-backed job queue rather than a Redis broker | Proposed |
| [0011](./0011-outbox-events-as-the-single-source-for-notifications-and-fut.md) | Outbox events as the single source for notifications and future webhooks | Proposed |
| [0012](./0012-performance-budget-enforced-in-ci.md) | Performance budget enforced in CI | Proposed |
| [0013](./0013-nextjs-as-a-bff-the-browser-never-holds-an-api-credential.md) | Next.js as a BFF: the browser never holds an API credential | Proposed |
| [0014](./0014-a-shared-contracts-package-is-the-only-coupling-between-web.md) | A shared contracts package is the only coupling between web and api | Proposed |
| [0015](./0015-openapi-generated-from-code-and-committed.md) | OpenAPI generated from code and committed to the repository | Accepted |
| [0016](./0016-shadcn-primitives-with-convert-owned-tokens.md) | shadcn primitives with Convert-owned tokens, in the web app | Accepted |
| [0017](./0017-drizzle-as-the-query-layer.md) | Drizzle as the query layer and migration tool | Accepted |
| [0018](./0018-errors-are-first-class.md) | Errors are a first-class part of the product | Accepted |
| [0019](./0019-protected-main-with-pull-request-only-changes.md) | Protected main, pull-request-only changes, and local hooks | Accepted |
| [0020](./0020-infisical-as-the-secret-store.md) | Infisical as the secret store, with secrets injected rather than filed | Accepted |
| [0021](./0021-mirror-notion-from-git-with-a-drift-gate.md) | Mirror Notion from git, and gate on drift rather than pushing automatically | Accepted |
| [0022](./0022-staging-on-railway-in-amsterdam.md) | Staging on Railway in Amsterdam, database included | Accepted |

Statuses: **Proposed** (written, not yet ratified) · **Accepted** (in force) · **Superseded** (replaced, kept for the record) · **Rejected** (considered and declined, kept so it is not re-litigated).

Most records here are **Proposed**: they were extracted from `architecture.md` so they could be cited and argued with. They become Accepted at the technical design sign-off, and their Consequences sections get completed then, an accepted ADR with an empty Consequences section is not finished.

## Writing one

1. Copy [`template.md`](./template.md) to `NNNN-short-slug.md`, taking the next free number.
2. Fill in Context before Decision. If the context does not make the decision feel forced, the decision is probably arbitrary.
3. Name the rejected alternatives and why they lost. This is the section future readers need most.
4. State how it is enforced. A CI gate, a boundary rule, a test, or a checklist line. A decision with no enforcement is a preference.

## Superseding one

Never edit an accepted record's Decision. Write a new ADR, set its **Supersedes** field, and set the old one's **Superseded by**. Both stay in the repository.

## The pairing rule

Changing `.boundaries.json`, `.github/workflows/ci.yml`, or `docs/engineering-guardrails.md` requires an ADR in the same pull request. CI gate G2 enforces it, via `tools/check_adr_discipline.py`. The failure mode it prevents: a red guardrail gets fixed by editing the rule, and the reason disappears.
