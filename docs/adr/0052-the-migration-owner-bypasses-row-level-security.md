# ADR 0052 - The migration owner bypasses row-level security, deliberately

**Status:** Accepted
**Date:** 2026-08-22
**Supersedes:** -
**Superseded by:** -

## Context

ADR 0042 split the database into two roles: an owner holding `DATABASE_URL` that runs DDL, and
`convert_app` holding `DATABASE_URL_APP` that reads and writes rows and can neither bypass row-level
security nor own a table. G7 asserts everything about the second role and nothing about the first.

That gap has a consequence nobody had written down, and independent review of ADR 0050's gate found
it by measurement. Every row-scoped table is `FORCE ROW LEVEL SECURITY`, which removes the *owner's*
exemption. So if the owner is an ordinary role, a migration running as it sees no rows through its own
policies — and `UPDATE` and `DELETE` affect nothing while reporting success:

```
rows_owner_can_see: 0
UPDATE 0
DELETE 0
-- ground truth: both rows still present, unchanged
```

`docs/deployment-runbook.md` makes migrations forward-only: a mistake is corrected by shipping a
repair migration, never by editing history. A repair migration that silently touches zero rows is the
worst available outcome for that policy — it merges green, deploys green, and leaves the data wrong.

The other half of the gap is that this is invisible in CI, which connects as `postgres`, a superuser.
So a backfill that would silently do nothing in production passes locally and in CI. Whether it would
actually fail on Railway depends on an attribute of the Railway role that this repository never
asserts and cannot see: ADR 0042 records that Railway hands out the `postgres` superuser and that
`DATABASE_URL` still uses it, with repointing it listed as an outstanding human step. So today the
owner almost certainly *can* bypass — and "almost certainly" is the problem, because the guarantee
either exists or it does not.

Both readings cannot be left open. If the owner bypasses, `FORCE` is decoration for it and the
tenancy story should say so. If it does not, every data migration needs to handle policies
explicitly, and none of them do.

## Decision

**The migration owner must be able to bypass row-level security**, by being a superuser or by holding
`BYPASSRLS`, and **G7 asserts it** on the `DATABASE_URL` connection rather than assuming it.

The reasoning is that a migration is not an application request. It operates on the schema and on
every tenant's data by definition — that is what a backfill *is* — so a boundary designed to scope one
tenant's requests has no business applying to it. Making the owner subject to policy does not add
protection; it converts correct-looking migrations into silent no-ops, which is a data-integrity
failure dressed as a security control.

**`convert_app` must not be a member of the owner role, directly or transitively.** Privileges and
attributes reach a role through membership, so an inherited path to the owner would hand the
application exactly the bypass this record grants the owner. G7 asserts non-membership; that check is
real today.

**`FORCE ROW LEVEL SECURITY` stays, and its purpose is stated rather than implied.** It protects
against a *future* change of ownership — a migration that reassigns a tenant table to a role without
bypass, at which point the policies start applying to it. ADR 0042 already called FORCE "belt and
braces"; this record says which braces.

**What the tenancy boundary therefore guarantees, stated plainly:** every application request is
scoped by policy, because `convert_app` cannot bypass, cannot own, and cannot create. Migrations are
not scoped, by design. The boundary is a property of the application's connection, not of the
database as a whole.

## Consequences

**Positive:** forward-only repair migrations work as written, which is the property the runbook
depends on. The gate now asserts something about both roles rather than one, so the pair is checked
as a pair. And the sentence a reviewer needs — "migrations are not tenant-scoped" — is written down
instead of being inferred from a connection string.

**Negative / cost:** the owner credential now reads every tenant's data by design, so it is
unambiguously a production secret with the highest blast radius in the system, and it belongs in
Infisical with that understanding (ADR 0020). This is less of a change than it reads: the owner could
already drop any policy it liked, so it always had this capability — the record makes it explicit
rather than granting it.

It also means a mistake in a migration has no second line of defence. Nothing at the database level
will stop a repair migration from touching the wrong tenant's rows; only review and the staging
environment will. That is the cost of the capability being useful.

If Railway's role turns out **not** to be a superuser, this assertion fails the first time the gate
runs against that database, which is the intended outcome: the fix is to grant `BYPASSRLS`
deliberately and record it, not to weaken the check.

**Rejected alternatives:**

- *Leave the owner's attributes unasserted.* What existed. Both readings of the tenancy guarantee
  stayed live, and the silent-no-op failure mode stayed undiscovered until someone shipped a backfill.
- *Require the owner to be subject to policy, and handle it in each migration* — `set local role`, or a
  temporary owner-scoped policy per backfill. Strictly stronger in principle, and it puts a manual
  step in the path of every data migration, where forgetting it produces the silent no-op this record
  exists to remove. Rejected because the failure mode of the safeguard is worse than what it guards.
- *A third role for backfills, holding `BYPASSRLS` and nothing else.* Cleaner in theory, and it is a
  third credential to provision, rotate and get wrong in six Railway variables, for a capability the
  owner needs anyway to alter the tables it owns.
- *Drop `FORCE` since the owner bypasses regardless.* It costs nothing and it is the only thing
  standing between a future ownership change and an open boundary.

## Enforcement

`packages/infra/scripts/assert-rls.ts` (G7), in the `application role attributes` subcheck, **real
today, on both roles**:

- the `DATABASE_URL` role is superuser or holds `BYPASSRLS`, and the assertion names which;
- the `DATABASE_URL` role is not the same role as `DATABASE_URL_APP`, which would collapse the split
  ADR 0042 exists to create;
- `convert_app` is not a member of the owner role, directly or through any chain of `pg_auth_members`;
- `convert_app` itself is still neither superuser nor `BYPASSRLS`, unchanged from ADR 0042.

**Verified by making it fail** on PostgreSQL 16.13: with the owner connection pointed at a freshly
created `nosuperuser nobypassrls` role, the gate fails naming that role; granting it `BYPASSRLS`
makes it pass. Granting `convert_app` membership in the owner role fails the membership check while
every other subcheck still passes, which is the case that would otherwise be invisible.

`docs/deployment-runbook.md` carries the operational half: which Railway variable holds which role,
and that the owner credential is the one with unrestricted read.
