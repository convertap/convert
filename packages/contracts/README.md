# `contracts` — packages/contracts

Shared DTOs, error envelope, ULID helpers, pagination cursors. The only package both web and api may import. Depends only on Zod.

## Import rules

Enforced by `tools/check_boundaries.py` in CI. Source of truth is `.boundaries.json`; the layering it encodes is `docs/architecture.md` §5.

- **May import:** **nothing** — this package is a leaf
- **Must not import:** any layer not listed above, in either direction of the dependency graph.
- **Forbidden third-party packages:** `next`, `react`, `@nestjs/common`, `@nestjs/core`, `drizzle-orm`, `prisma`, `pg`

## What belongs here

DTOs crossing the web/api line, the error envelope, ULID helpers, pagination cursor codecs, shared enums.

## What does not

Domain rules, validation that depends on stored state, anything importing a runtime.

## Changing these rules

Edit `.boundaries.json` only in the same commit as an ADR under `docs/adr/` that explains why the layering changed. A boundary edited without an ADR is the failure mode this whole arrangement exists to prevent.
