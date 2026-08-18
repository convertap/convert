# `application` — packages/application

Use cases. Takes a Principal, enforces authorization and entitlements, writes activity rows. Shared by api and worker, so it must stay framework-free.

## Import rules

Enforced by `tools/check_boundaries.py` in CI. Source of truth is `.boundaries.json`; the layering it encodes is `docs/architecture.md` §5.

- **May import:** `@convert/core`, `@convert/contracts`
- **Must not import:** any layer not listed above, in either direction of the dependency graph.
- **Forbidden third-party packages:** `next`, `react`, `react-dom`, `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-fastify`, `fastify`, `express`, `drizzle-orm`, `prisma` (+5 more in `.boundaries.json`)

## What belongs here

Use cases. Each takes a Principal, checks authorization and entitlements, calls the domain, and writes an activity row. Shared by api and worker.

## What does not

Framework decorators, transport concerns, SQL. If it only makes sense over HTTP, it belongs in apps/api.

## Changing these rules

Edit `.boundaries.json` only in the same commit as an ADR under `docs/adr/` that explains why the layering changed. A boundary edited without an ADR is the failure mode this whole arrangement exists to prevent.
