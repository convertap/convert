# ADR 0017 - Drizzle as the query layer and migration tool

**Status:** Accepted
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

ADR 0002 makes PostgreSQL row-level security the tenancy boundary: every tenant table carries an `org_id` policy, the application connects as a role that cannot bypass RLS, and the current organization is set per transaction. That is the single control preventing a forgotten predicate from becoming a cross-tenant data breach.

RLS puts two hard requirements on the query layer:

1. **Per-transaction session state.** Every transaction must issue `SET LOCAL app.current_org = …` on the same connection that runs the subsequent statements. A pooled connection that leaks org context between requests is worse than no RLS at all.
2. **Policy DDL in migrations.** `CREATE POLICY`, `ALTER TABLE … ENABLE ROW LEVEL SECURITY`, and the `GRANT` revocations that keep `activity` append-only (ADR 0009) all have to live in version-controlled migrations that CI can apply to an empty database and assert against (gate G7).

`packages/core` and `packages/application` must stay free of the query layer entirely - it is a forbidden import in both (`.boundaries.json`), so whatever is chosen lives only in `packages/infra`.

## Decision

**Drizzle ORM** as the query layer and **Drizzle Kit** for migrations, in `packages/infra` only.

- Schema defined in TypeScript, migrations generated and then edited by hand where policy DDL is needed. Generated SQL is committed and reviewed, not applied blind.
- Every repository method runs inside a transaction helper that sets the org context first, so acquiring a connection and setting its context cannot be separated.
- RLS policies, `GRANT` revocations, and the append-only constraints live in the same migration files as the tables they protect.
- Drizzle types stay behind repository interfaces defined in `core`. A Drizzle row type never reaches a use case.

## Consequences

**Positive:** SQL stays visible and editable, which matters because the security model is expressed in SQL rather than in application code. Raw statements and policy DDL need no escape hatch. Types are inferred from the schema without a code-generation step in the build. Small runtime footprint, which suits the worker.

**Negative / cost:** a smaller ecosystem and less prescriptive tooling than the alternative - no bundled studio-grade migration workflow, fewer worked examples, and more that the team has to decide for itself. Relation queries are less ergonomic than a mature ORM's eager loading, so some read paths will be hand-written SQL. Drizzle Kit occasionally generates migrations that need manual correction, which is exactly why generated SQL is committed and reviewed.

**Rejected alternatives:**

- **Prisma.** Better documentation, a stronger migration workflow, and the more common NestJS pairing. Rejected because RLS is awkward through it: setting per-transaction session state requires interactive transactions or a client extension, policy DDL needs custom migration files outside the normal flow, and the abstraction actively hides the SQL that carries our tenancy guarantee. Choosing it would mean fighting the tool at the exact point where correctness matters most.
- **TypeORM.** Mature and Nest-adjacent, but migration ergonomics and maintenance trajectory are weaker, and its abstraction has the same problem as Prisma's for our purposes.
- **Raw `pg` with hand-written SQL.** Maximum control and no abstraction to fight, but no schema types, no migration tooling, and a large amount of repetitive mapping code for a CRUD-heavy product.

## Enforcement

`.boundaries.json` forbids `drizzle-orm` in `core`, `application`, and `web`; it is permitted only in `infra`. Gate G7 applies migrations to an empty database and asserts RLS is enabled on every tenant table. Invariant tests I01 (org scoping) and I06 (append-only activity) assert the policies actually hold rather than merely being declared.
