# `core` — packages/core

Framework-free domain logic, entities, and ports. Invariants I1-I12 live here. No decorators, no ORM, no HTTP.

## Import rules

Enforced by `tools/check_boundaries.py` in CI. Source of truth is `.boundaries.json`; the layering it encodes is `docs/architecture.md` §5.

- **May import:** `@convert/contracts`
- **Must not import:** any layer not listed above, in either direction of the dependency graph.
- **Forbidden third-party packages:** `next`, `react`, `react-dom`, `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-fastify`, `fastify`, `express`, `hono`, `drizzle-orm` (+18 more in `.boundaries.json`)

## What belongs here

Entities, value objects, domain services, and ports (interfaces) for anything external. Invariants I1-I12 are expressed and unit-tested here.

## What does not

Nest decorators, ORM models, HTTP, SQL, provider SDKs, environment variables.

## Changing these rules

Edit `.boundaries.json` only in the same commit as an ADR under `docs/adr/` that explains why the layering changed. A boundary edited without an ADR is the failure mode this whole arrangement exists to prevent.
