# ADR 0009 - Append-only activity log, distinct from system audit

**Status:** Proposed
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

Activity history is the direct answer to the pitch's third problem: the business history must outlive the rep who created it. System actions have a different reader and different retention.

## Decision

`activity` is insert-only and rep-facing. `audit_event` is separate and admin-facing: logins, role changes, deactivations, exports. Corrections to activity are new rows.

## Consequences

**Positive:** _complete when this ADR is accepted._

**Negative / cost:** _complete when this ADR is accepted._

**Rejected alternatives:** _complete when this ADR is accepted._

## Enforcement

Invariant test I6 asserting no update or delete path exists; database grants withhold UPDATE and DELETE on `activity`.
