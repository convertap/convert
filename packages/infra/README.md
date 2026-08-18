# `infra` — packages/infra

Adapters that implement core ports: repositories, migrations, WhatsApp/SMS providers, queue, observability.

## Import rules

Enforced by `tools/check_boundaries.py` in CI. Source of truth is `.boundaries.json`; the layering it encodes is `docs/architecture.md` §5.

- **May import:** `@convert/core`, `@convert/contracts`
- **Must not import:** any layer not listed above, in either direction of the dependency graph.
- **Forbidden third-party packages:** `next`, `react`, `react-dom`

## What belongs here

Repository implementations, migrations, WhatsApp and SMS adapters, queue client, observability wiring. Implements ports defined in core.

## What does not

Business rules. If a rule is here, it cannot be unit-tested without a database.

## Changing these rules

Edit `.boundaries.json` only in the same commit as an ADR under `docs/adr/` that explains why the layering changed. A boundary edited without an ADR is the failure mode this whole arrangement exists to prevent.
