# ADR 0005 - Provider-agnostic messaging ports

**Status:** Proposed
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

The production WhatsApp provider path is undecided (checklist E3), and demo work may run on test credentials. Provider choice must not reach the domain.

## Decision

`packages/core` defines `MessageSender`, `TemplateCatalog`, and `ConsentGate` ports. Every provider is an adapter in `packages/infra/src/providers`, wired only in a composition root.

## Consequences

**Positive:** _complete when this ADR is accepted._

**Negative / cost:** _complete when this ADR is accepted._

**Rejected alternatives:** _complete when this ADR is accepted._

## Enforcement

Boundary checker forbids provider SDKs inside core and application; adapters are only importable from composition roots.
