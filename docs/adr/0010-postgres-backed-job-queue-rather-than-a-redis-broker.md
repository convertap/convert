# ADR 0010 - Postgres-backed job queue rather than a Redis broker

**Status:** Proposed
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

Jobs are required from day one, but a second stateful service is operational overhead the team does not yet have. NestJS conventionally reaches for BullMQ on Redis.

## Decision

Use a Postgres-backed queue so the datastore count stays at one. Revisit only if measured throughput requires it.

## Consequences

**Positive:** _complete when this ADR is accepted._

**Negative / cost:** _complete when this ADR is accepted._

**Rejected alternatives:** _complete when this ADR is accepted._

## Enforcement

Architecture review; revisiting requires a superseding ADR.
