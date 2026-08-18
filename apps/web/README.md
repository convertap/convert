# `web` — apps/web

Next.js App Router. UI plus BFF route handlers that hold the session and call the API server-side. Knows DTOs, never domain logic.

## Import rules

Enforced by `tools/check_boundaries.py` in CI. Source of truth is `.boundaries.json`; the layering it encodes is `docs/architecture.md` §5.

- **May import:** `@convert/contracts`
- **Must not import:** any layer not listed above, in either direction of the dependency graph.
- **Forbidden third-party packages:** `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-fastify`, `fastify`, `drizzle-orm`, `prisma`, `@prisma/client`, `pg`, `postgres`, `bullmq` (+1 more in `.boundaries.json`)

## What belongs here

App Router routes, server components, BFF route handlers that hold the session, UI components, client-side interaction.

## What does not

Domain logic, database access, provider SDKs, or an API token in browser-reachable code. Fetch on the server, not in the client, or the perf budget in docs/architecture.md §18 fails.

## Changing these rules

Edit `.boundaries.json` only in the same commit as an ADR under `docs/adr/` that explains why the layering changed. A boundary edited without an ADR is the failure mode this whole arrangement exists to prevent.
