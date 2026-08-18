# ADR 0011 - Outbox events as the single source for notifications and future webhooks

**Status:** Proposed
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

In-app notifications ship now; integration webhooks ship with the Pro-tier API. Two independent implementations would diverge.

## Decision

Domain facts write an `outbox_event` row. Notifications consume it now; the webhook delivery worker consumes the same stream later.

## Consequences

**Positive:** _complete when this ADR is accepted._

**Negative / cost:** _complete when this ADR is accepted._

**Rejected alternatives:** _complete when this ADR is accepted._

## Enforcement

Review checklist: a new domain fact adds an outbox event, not a bespoke notification call.
