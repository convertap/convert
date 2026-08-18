# ADR 0012 - Performance budget enforced in CI

**Status:** Proposed
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

Mobile-first is the product's differentiation claim. Without a gate it degrades silently, one convenience library at a time. The Next.js and NestJS split makes client-side data waterfalls the likeliest regression.

## Decision

The budgets in `docs/architecture.md` section 18 are enforced as a CI gate on the main pipeline screens. Data fetching happens in server components and route handlers, not in client components.

## Consequences

**Positive:** _complete when this ADR is accepted._

**Negative / cost:** _complete when this ADR is accepted._

**Rejected alternatives:** _complete when this ADR is accepted._

## Enforcement

CI performance job; boundary rules keep database and provider access out of `apps/web`.
