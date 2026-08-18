# `worker` — apps/worker

NestJS standalone application context. Campaign sends, reminder sweeps, provider event processing, read-model refresh.

## Import rules

Enforced by `tools/check_boundaries.py` in CI. Source of truth is `.boundaries.json`; the layering it encodes is `docs/architecture.md` §5.

- **May import:** `@convert/application`, `@convert/core`, `@convert/contracts`
- **Must not import:** any layer not listed above, in either direction of the dependency graph.
- **Forbidden third-party packages:** `next`, `react`, `react-dom`

## What belongs here

Job handlers: campaign sends, reminder sweeps, provider event processing, read-model refresh. Every handler idempotent with a dedupe key.

## What does not

New business rules. A job orchestrates use cases; it does not contain them.

## Changing these rules

Edit `.boundaries.json` only in the same commit as an ADR under `docs/adr/` that explains why the layering changed. A boundary edited without an ADR is the failure mode this whole arrangement exists to prevent.
