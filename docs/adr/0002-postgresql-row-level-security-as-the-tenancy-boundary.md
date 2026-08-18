# ADR 0002 - PostgreSQL row-level security as the tenancy boundary

**Status:** Proposed
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

Multiple businesses share one deployment. A forgotten `org_id` predicate in any query is a cross-tenant data breach, and convention alone does not survive a growing codebase.

## Decision

Every tenant table carries a non-null `org_id` with an RLS policy. The application connects as a role that cannot bypass RLS, and sets the current organization per transaction.

## Consequences

**Positive:** _complete when this ADR is accepted._

**Negative / cost:** _complete when this ADR is accepted._

**Rejected alternatives:** _complete when this ADR is accepted._

## Enforcement

Migration test asserting every tenant table has RLS enabled; integration test asserting a query without org context returns zero rows.
