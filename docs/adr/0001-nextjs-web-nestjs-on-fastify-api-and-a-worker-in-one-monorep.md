# ADR 0001 - Next.js web, NestJS on Fastify API, and a worker in one monorepo

**Status:** Accepted
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

The team ships production TypeScript. Three runtimes are needed: a mobile-first UI, an HTTP API, and background job execution for campaign sends and reminder sweeps. A single server-rendered monolith was considered and rejected in favour of an explicit API boundary, which the Pro-tier public API (deck slide 6) will later reuse.

## Decision

One pnpm monorepo. `apps/web` is Next.js (App Router). `apps/api` is NestJS on the Fastify adapter. `apps/worker` is a NestJS standalone application context. Domain and use cases live in `packages/core` and `packages/application` so the API and the worker share them.

## Consequences

**Positive:** _complete when this ADR is accepted._

**Negative / cost:** _complete when this ADR is accepted._

**Rejected alternatives:** _complete when this ADR is accepted._

## Enforcement

`tools/check_boundaries.py` plus the layer matrix in `.boundaries.json`.
