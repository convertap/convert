# ADR 0004 - ULID external identifiers

**Status:** Proposed
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

Auto-increment integers leak row counts and cannot be exposed through a public API.

## Decision

Every entity carries an opaque ULID as its external identifier. Internal integer keys never leave the process.

## Consequences

**Positive:** _complete when this ADR is accepted._

**Negative / cost:** _complete when this ADR is accepted._

**Rejected alternatives:** _complete when this ADR is accepted._

## Enforcement

Contract test asserting no numeric `id` appears in any serialized DTO.
