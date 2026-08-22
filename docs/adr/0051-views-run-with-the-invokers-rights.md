# ADR 0051 - Views run with the invoker's rights, and a materialized view may not read tenant data

**Status:** Accepted
**Date:** 2026-08-22
**Supersedes:** - (ADR 0050 leaves views and materialized views to this record; both land in the same unlanded change, so nothing shipped is being replaced)
**Superseded by:** -

## Context

ADR 0050's first draft refused views and materialized views outright. That was the honest
placeholder: independent review had demonstrated both leaking a full tenant table to the application
role, and nobody had decided how they should be scoped, so failing the build beat modelling them
wrongly. Neither record had landed, so this one takes the decision rather than superseding a shipped
one, and 0050 now leaves the subject here.

The refusal has a cost that lands on the first person who needs a view: a red build, no registry
class available to them, and an ADR to write before they can proceed. Reporting screens are a
foreseeable need — `mvp-scope.md` puts a dashboard in scope — so leaving it undecided means the
decision gets made under deadline pressure by whoever hits it.

It is also decidable now, cheaply, because the behaviour is measurable rather than a matter of
judgement. Against PostgreSQL 16.13 on 22 August 2026, with `lead` carrying a canonical
`workspace-rls` policy and two rows in two workspaces, read as `convert_app` with tenant A's context
set:

| Relation | Definition | Rows visible |
|----------|-----------|--------------|
| `lead` | the table itself | 1 — isolated |
| `v_default` | `create view v_default as select * from lead` | **2 — every tenant** |
| `v_invoker` | the same, `with (security_invoker = true)` | 1 — isolated |
| `mv` | `create materialized view mv as select * from lead` | **2 — every tenant** |

The mechanism is documented and matches: a view executes with the privileges of its **owner** unless
`security_invoker` is set, in which case it executes with those of the invoking role, and row-level
security follows the same rule. Migrations run as the owner (ADR 0042), so a view created by a
migration reads tenant tables as a role whose policies do not apply. A materialized view is worse and
not fixable by an option: row-level security is never applied when reading one, because the rows were
computed and stored at refresh time.

> "If the view has the `security_invoker` property set to `true`, the view's underlying base
> relations are accessed with the privileges of the user of the view rather than the view owner."
> — [CREATE VIEW](https://www.postgresql.org/docs/16/sql-createview.html), read rather than
> remembered.

## Decision

**Every view in `public` must set `security_invoker = true`.** It becomes a classifiable relation
with its own registry class, `view`, declaring `appPrivileges` like any other entry. A view without
the option fails G7, whatever it selects from — the check does not try to work out whether the
particular view is dangerous, because the option costs nothing on a view that reads no tenant data
and the exception would be the thing that gets copied.

**A materialized view may not read a row-scoped table, transitively, and may not call a routine at
all.** G7 walks view dependencies through `pg_rewrite` and `pg_depend` and fails a materialized view
whose base relations include any table classified `workspace-rls` or `user-rls`. That walk cannot see
through a function: one declared `returns table (...)` leaves no dependency on the tables it selects
from, so `create materialized view mv as select * from all_workspaces()` was invisible to it while
`REFRESH` — running as the owner, which ADR 0052 requires to bypass — stored every tenant's rows.
Review demonstrated it. So a materialized view whose definition references any routine is refused
outright rather than analysed. Dependencies on built-in functions are not recorded in `pg_depend`, so
this fires only on routines somebody wrote. A materialized view over unscoped data, selecting
directly from relations, is permitted and needs no option, because there is nothing for a policy to
protect.

**`security_invoker` does not make a view a way to widen access.** The invoking role still needs its
own privileges on the base tables, so a view cannot be used to hand `convert_app` a table its entry
does not declare. That is a property of the mechanism rather than a check, and it is why this
decision is small: the option restores the ordinary rules instead of adding a second set.

**Nothing changes about tables.** The nine subchecks ADR 0050 describes still apply to every table
and partition, and a view's base tables are checked as tables in their own right.

## Consequences

**Positive:** the reporting screens the scope document promises can be built without a decision
detour, and the way they are built is machine-enforced rather than remembered. The rule is one
option on one statement, which is about as cheap as a security requirement gets. And the failure mode
it removes is the worst kind — a view that looks like a convenience and quietly returns every
tenant's rows, in a codebase whose reviewers have been taught that RLS is the boundary.

**Negative / cost:** `security_invoker` means a view cannot be used deliberately to expose an
aggregate that crosses tenants — a platform-wide count, say — because the invoker's policies apply to
it too. ADR 0035 already routes platform-admin access through an audited action rather than ambient
reads, so that is consistent, but it does close a door somebody will eventually reach for.

Materialized views over tenant data are prohibited rather than solved. If a dashboard genuinely needs
one for performance, the answer is a real table maintained by the worker with its own policy, which
is more work than a `refresh materialized view`. That trade is accepted here rather than discovered
later, and the alternative — a matview plus a policy — does not exist in Postgres.

Dependency walking is done through `pg_rewrite`, which is an internal catalogue, and the query is
more obscure than the rest of the gate. It earns its place by being the only way to answer "what does
this read" without parsing SQL.

**Rejected alternatives:**

- *Keep the blanket refusal.* Free, and it defers a decision that is measurable today onto whoever is
  in a hurry.
- *Require `security_invoker` only on views that touch tenant tables.* Narrower, and it means the
  rule a developer has to remember has a condition in it. A view's base tables also change over time,
  so the exemption would need rechecking on every migration; the unconditional rule does not.
- *Allow a plain view whose owner is a non-bypassing role.* Technically sufficient today and it makes
  the guarantee depend on role attributes at creation time rather than on a property of the view. ADR
  0052 makes the migration owner a bypassing role deliberately, so this would be false immediately.
- *Allow materialized views with a policy on the matview itself.* Not available: row-level security
  is not applied when reading a materialized view at all.
- *Allow materialized views and rely on the grant.* A grant restricts operations, never rows — the
  same error ADR 0050 removed from ADR 0047.

## Enforcement

`packages/infra/scripts/assert-rls.ts` (G7), in the `registry to database catalogue` subcheck, which
is **vacuous today because the schema holds no views and no migrations exist**:

- a view in `public` without `security_invoker = true` in its `reloptions` fails, naming the option;
- a view or materialized view absent from `TABLE_ACCESS` fails as unclassified, like any relation,
  and the converse is checked too: a *table* classified `view` fails. Leaving that direction
  unchecked made `view` the least-scrutinised class in the registry - no `reason`, no policy
  requirement - and therefore an escape hatch a table could use to skip the graph rules entirely.
  Review demonstrated it by changing one word in a previously-leaking entry;
- a materialized view whose transitive base relations include a `workspace-rls` or `user-rls` table
  fails, naming the path it reads through — and one whose definition calls any routine fails
  regardless of what that routine reads, because the dependency graph cannot follow it;
- a `view` entry's `appPrivileges` are compared as effective access, exactly as for a table, so a
  column grant or a group-inherited privilege on a view is caught too.

**Verified by making it fail** on PostgreSQL 16.13: a plain view over a `workspace-rls` table fails
the option check, and the same view with `security_invoker = true` passes and returns one tenant's row
where the plain one returned both. A materialized view over the same table fails the dependency check.
The table in the Context section is that measurement.

**Re-proven on PostgreSQL 18 (ADR 0053).** The four-row table above was measured on PostgreSQL 16.13. On 18.6 the numbers are identical: table 1, plain view 2, `security_invoker` view 1, materialized view 2. Both halves of this decision still hold. ADR 0053 holds the current evidence.
