# ADR 0013 - Next.js as a BFF: the browser never holds an API credential

**Status:** Proposed
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

Splitting web and API introduces a cross-origin session problem. Putting an access token in browser-reachable code exposes it to XSS and makes revocation unreliable.

## Decision

The session lives in an httpOnly, same-site cookie owned by `apps/web`. Route handlers and server components call the API server-side with a service credential. No browser code talks to the API directly.

## Consequences

**Positive:** _complete when this ADR is accepted._

**Negative / cost:** _complete when this ADR is accepted._

**Rejected alternatives:** _complete when this ADR is accepted._

## Enforcement

Boundary rules plus a review checklist item; a client component that fetches the API directly is a review block.
