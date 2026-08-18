# ADR 0014 - A shared contracts package is the only coupling between web and api

**Status:** Proposed
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

Both runtimes are TypeScript, so shared types are nearly free, but sharing too much would let domain logic leak into the browser bundle.

## Decision

`packages/contracts` holds DTOs, the error envelope, and pagination cursors, and is the only package `apps/web` may import. Domain entities stay in `packages/core`, unreachable from the web app.

## Consequences

**Positive:** _complete when this ADR is accepted._

**Negative / cost:** _complete when this ADR is accepted._

**Rejected alternatives:** _complete when this ADR is accepted._

## Enforcement

Boundary checker: the `web` layer may import `contracts` alone.
