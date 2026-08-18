# ADR 0003 - Principal abstraction covering sessions, API clients, and the worker

**Status:** Proposed
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

The deck sells a Pro-tier public API. If endpoints assume an interactive session, adding API clients later touches every route.

## Decision

Every use case takes a `Principal`: `UserPrincipal`, `ClientPrincipal`, or `SystemPrincipal`. Activity and audit rows record which kind acted.

## Consequences

**Positive:** _complete when this ADR is accepted._

**Negative / cost:** _complete when this ADR is accepted._

**Rejected alternatives:** _complete when this ADR is accepted._

## Enforcement

Type signature on every use case in `packages/application`; review checklist item.
