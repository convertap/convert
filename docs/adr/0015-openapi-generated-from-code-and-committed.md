# ADR 0015 - OpenAPI generated from code and committed to the repository

**Status:** Accepted
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

The deck sells a public API at Pro tier, and the Next.js web app is already an API consumer from day one, so an undocumented API has two victims rather than one.

Documentation written after the fact is documentation that is wrong. A hand-maintained spec drifts within weeks. Meanwhile the web/api split introduces a real risk that DTO shapes are defined twice and diverge quietly.

## Decision

OpenAPI ships with the first endpoint, not at launch.

- The spec is generated from the code with `@nestjs/swagger`. Controllers and DTOs carry decorators; there is no hand-written spec file.
- The generated spec is committed as `apps/api/openapi.json`, so every API change appears as a reviewable diff in the pull request that causes it.
- Gate G10 regenerates the spec in CI and fails on any diff, and fails on an endpoint missing a summary, a response type, or a typed body.
- Every DTO carries an example. Error responses are documented against the shared error envelope in `packages/contracts`, not just the success path.
- Swagger UI is enabled in local and staging. In production it sits behind authentication until the Pro-tier public API launches.

## Consequences

**Positive:** the Pro-tier public API becomes a decision about which documented endpoints to expose rather than a documentation project. `apps/web` can generate a typed client from the same spec, which removes the DTO drift risk created by ADR 0001. Breaking changes surface in review.

**Negative / cost:** decorator noise on controllers and DTOs, and a committed generated artifact that will occasionally cause merge conflicts. Both are cheap relative to a consumer discovering a changed response shape in production.

**Rejected alternatives:** a spec-first workflow, which fits a multi-team contract negotiation better than a single team shipping quickly; and generating the spec only in CI without committing it, which loses the reviewable diff that is most of the value here.

## Enforcement

CI gate G10 in `.github/workflows/ci.yml`; convention documented in `docs/engineering-guardrails.md` §6.1; pull request template checklist item.
