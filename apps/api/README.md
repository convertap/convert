# `api` — apps/api

NestJS on the Fastify adapter. HTTP interface, webhook ingress, principal resolution, and later the Pro-tier public API. Thin: controllers call use cases.

## Import rules

Enforced by `tools/check_boundaries.py` in CI. Source of truth is `.boundaries.json`; the layering it encodes is `docs/architecture.md` §5.

- **May import:** `@convert/application`, `@convert/core`, `@convert/contracts`
- **Must not import:** any layer not listed above, in either direction of the dependency graph.
- **Forbidden third-party packages:** `next`, `react`, `react-dom`

## What belongs here

NestJS modules, controllers, guards that resolve a Principal, webhook ingress, DTO validation, OpenAPI decoration. Controllers stay thin.

## What does not

Business rules, direct SQL, provider SDK calls. Those live in application, core, and infra respectively.

## Changing these rules

Edit `.boundaries.json` only in the same commit as an ADR under `docs/adr/` that explains why the layering changed. A boundary edited without an ADR is the failure mode this whole arrangement exists to prevent.
