# ADR 0006 - Unified bidirectional message record with forward-only status

**Status:** Proposed
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

The rep-facing timeline is chronological regardless of direction, and delivery callbacks arrive out of order and more than once.

## Decision

One `message` table with a `direction` column and a status state machine that only advances: queued to sent to delivered to read, with failure terminal. Late-arriving earlier states are ignored.

## Consequences

**Positive:** _complete when this ADR is accepted._

**Negative / cost:** _complete when this ADR is accepted._

**Rejected alternatives:** _complete when this ADR is accepted._

## Enforcement

Invariant test asserting a regressive status callback does not change stored status.
