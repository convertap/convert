# ADR 0008 - Consent as an append-only record

**Status:** Proposed
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

Marketing opt-in is simultaneously a Meta requirement and a Ghana Act 843 requirement. A boolean cannot carry when, how, and through which path consent was given, nor its withdrawal.

## Decision

A `consent` row per contact, channel, and grant event. Withdrawal appends a new row rather than mutating the old one. Marketing sends check for live consent at send time.

## Consequences

**Positive:** _complete when this ADR is accepted._

**Negative / cost:** _complete when this ADR is accepted._

**Rejected alternatives:** _complete when this ADR is accepted._

## Enforcement

Invariant test I9; the consent gate sits in the send path, not in the UI.
