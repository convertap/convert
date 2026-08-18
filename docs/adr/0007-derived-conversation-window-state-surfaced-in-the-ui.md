# ADR 0007 - Derived conversation-window state, surfaced in the UI

**Status:** Proposed
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

WhatsApp permits free-form replies only within 24 hours of the customer's last inbound message. Hiding that rule produces messages that silently fail to send.

## Decision

Window state is derived from `contact.last_inbound_at`, never stored. The service layer rejects a free-form send into a closed window, and the UI shows window state on the contact record.

## Consequences

**Positive:** _complete when this ADR is accepted._

**Negative / cost:** _complete when this ADR is accepted._

**Rejected alternatives:** _complete when this ADR is accepted._

## Enforcement

Invariant test I10; UI review checklist item.
