# ADR 0050 - One table access registry, classified by what the gate demands

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** 0042, in one part only — the table classification inventory; 0047, in two parts only — `IDENTITY_TABLES`, and the `verification_attempt` access mechanism
**Superseded by:** 0051, in one part only — the blanket refusal of views and materialized views, which is now a rule they can satisfy. Everything else here stands, and ADR 0052 additionally asserts the migration owner's attributes, which this record left as an open question

## Context

Two accepted records described the same space with different vocabularies, and neither mentioned the
other.

**ADR 0042** requires every public table to appear in exactly one of `TENANT_TABLES` and
`NON_TENANT_TABLES`, so that omitting tenant metadata cannot slip a table past G7.
`NON_TENANT_TABLES` means "public tables that deliberately have no `workspace_id`".

**ADR 0047** gave identity tables their own list, `IDENTITY_TABLES`, which never joins
`TENANT_TABLES`, and put row-level security on `session` keyed on a second GUC, `app.current_user`.

Under 0042's rule `session` lands in `NON_TENANT_TABLES`, which is true — it has no `workspace_id` —
and says nothing about the policy 0047 requires of it. **A table could satisfy 0042 completely while
silently failing the thing 0047 cared about.**

The reason the two lists cannot be reconciled by nesting one inside the other is that they are not
measuring the same thing. 0042 classifies by *presence of a column*. 0047 classifies by *domain*.
Neither axis answers the only question the gate needs answered: **what must be true of this table
for it to be safe?** And the domain axis actively cannot answer it, because 0047's three identity
tables do not want the same treatment — `session` gets an `app.current_user` policy, while `user` is
looked up by phone or email before any principal exists and so cannot satisfy such a policy on the
path that matters most.

**A second problem surfaced while working this, and it is the more serious of the two.** ADR 0047
justified `verification_attempt` having no row-level security with "an honest grant of insert plus
select restricted to the identifier presented". Postgres grants cannot do that. A grant restricts
*operations* and *columns*; it has no concept of a row predicate. `grant select` on that table hands
`convert_app` every row in it, and the same reasoning applied to `user` hands it every account. The
record was not describing a weaker protection than intended; it was describing a mechanism that does
not exist, in the voice of one that does.

## Decision

**One registry, keyed by table name, classifying every declared table by the access control the gate
must demand of it.** It lives in `packages/infra/src/db/access.ts`, and `TENANT_TABLES` and
`NON_TENANT_TABLES` are deleted rather than kept as derived exports — a compatibility export would
preserve the vocabulary this record exists to retire.

```ts
type TableAccess =
  | { kind: 'workspace-rls'; scopeColumn: string; appPrivileges: readonly TablePrivilege[] }
  | { kind: 'user-rls'; scopeColumn: string; appPrivileges: readonly TablePrivilege[] }
  | {
      kind: 'role-grants';
      appPrivileges: readonly TablePrivilege[];
      reason: string;
    };
```

A map rather than a set of lists, because membership in exactly one class stops being a property to
check and becomes one the type cannot express otherwise. The cross-list loop that 0042 needed —
which only ever checked one of its two directions — disappears rather than getting fixed.

**Every class declares `appPrivileges`, including the row-scoped ones.** The first draft gave that
field to `role-grants` alone, on the reasoning that a tenant table's protection is its policy. It is
not: a policy governs which rows are visible and says nothing about `TRUNCATE`, which never visits a
row. So the registry could not express what the application may do to the tables holding all the
tenant data, and invariant I6 — `activity` and `consent` withhold `UPDATE` and `DELETE` — was not
representable in the structure meant to be the single answer to that question.

**`role-grants` controls permitted operations, never row visibility. A table requiring row-scoped
access cannot use `role-grants`.** This is the rule that replaces 0047's `verification_attempt`
paragraph, and it is deliberately phrased as a prohibition, because the failure it prevents is a
reviewer reading "no RLS, narrow grant instead" and believing rows were narrowed.

**That prohibition is held by the foreign-key graph, not by a column name.** A `role-grants` table
with any transitive foreign-key path to a row-scoped table fails, and a NOT NULL `uuid` foreign key
to `workspace(id)` forces `workspace-rls` on the table holding it, whatever that column is called.
The first draft looked for a column named `workspace_id`, which review defeated in one move: a child
table with a `lead_id` and no tenant column of its own classified itself `role-grants`, carried a
`reason` a reviewer would accept, and returned every tenant's rows. **A `reason` is not a defence** —
it is the sentence a reviewer reads instead of checking, so the gate does not rely on it being true.

**The class names what is enforced, not what the table is about.** "Identity" remains a domain
concept, and it belongs in the glossary, where nothing load-bearing rests on it.

**Only tables and partitioned tables are classifiable. Views and materialized views fail the build.**
A view runs with its owner's rights unless it sets `security_invoker`, and migrations run as the
owner, so a view over a tenant table bypasses that table's policy; row-level security never applies
to reading a materialized view at all. Both were demonstrated returning a full tenant table to the
application role. Neither gets a registry class here, because how they should be scoped is a decision
nobody has made, and refusing them is the honest placeholder for it.

**A partition inherits its root's entry** rather than needing one of its own — a monthly-partitioned
table would otherwise need a registry entry per month — and is then held to the same policy rules,
because reading a partition directly applies that partition's policies rather than its parent's. Its
privileges are held to a subset of the root's rather than an exact match, since grants on a parent do
not reach its partitions and demanding them would force over-granting.

**One canonical policy per row-scoped table**, and the gate demands exactly this shape:

```sql
CREATE POLICY workspace_scope
ON example
AS PERMISSIVE
FOR ALL
TO convert_app
USING (
  workspace_id = nullif(current_setting('app.current_workspace', true), '')::uuid
);
```

`AS PERMISSIVE`, `FOR ALL`, `TO convert_app` and never `PUBLIC`, one equality between the declared
`scopeColumn` and the GUC for the class, and `WITH CHECK` omitted so it is catalogued as null.
Postgres uses the `USING` expression for both visible rows and newly added ones when `WITH CHECK` is
omitted on an `ALL` policy, so one expression governs read and write and there is one thing to verify
rather than two that can disagree.

**`scopeColumn` is checked against the catalogue, not taken on trust.** It must exist, be a NOT NULL
`uuid`, and either reference `workspace(id)` or be it. A nullable scope column is worse than it
looks: a null never equals the context, so such a row is unreachable rather than protected. And a
plausible wrong answer — `created_by_id` on a table that also carries `workspace_id` — produces a
policy that is canonical in shape and isolates by the wrong axis, which review demonstrated passing.

**A second permissive policy on the same table fails the gate, whatever it says.** Permissive
policies combine with `OR`, so a second one can only widen what is visible, and widening is invisible
in a diff that adds a file. Restrictive policies are permitted and ignored: they combine with `AND`
and cannot broaden. Any future need for asymmetric read and write scope takes its own ADR rather than
an ad hoc second policy.

**The `nullif` wrapper is part of the canonical form, not a style preference.** Without it an empty
context raises `invalid input syntax for uuid` instead of returning no rows, so a forgotten context
becomes a 500 rather than an empty list. ADR 0042 put this in bold and nothing enforced it outside
the fixture table.

**Privileges are compared as *effective* access, on every class.** The gate reads
`has_table_privilege` and `has_any_column_privilege` rather than
`information_schema.role_table_grants`, which shows only table-level grants and only where the
grantor or grantee is a currently enabled role. It therefore sees a privilege reaching `convert_app`
through a group role, and a grant on a single column — `grant select (name) on workspace to
convert_app` was invisible to the first draft while the entry declared no privileges at all. Any
grant to `PUBLIC` fails, and `TRUNCATE`, `REFERENCES` and `TRIGGER` fail on **every** class, not just
grant-only tables: row-level security governs none of the three, so a perfect policy is no defence,
and `TRUNCATE` on a tenant table destroys every tenant's rows.

**The bootstrap stops granting table privileges, and revokes the default it used to install.**
`bootstrap.sql` held `grant select, insert, update, delete on all tables in schema public` plus an
`alter default privileges` doing the same for every table a later migration creates. A blanket
default grant makes every future table fully readable and writable by `convert_app` whatever its
registry entry says, so the registry would describe the intent while the database did something else.
Deleting the statement is not enough: a `pg_default_acl` entry survives the script that created it,
so the bootstrap now issues the matching `REVOKE`, which is idempotent, and G7 asserts the catalogue
is clean rather than trusting that the file ran. Sequence grants stay, and should stay unused,
because ADR 0043 makes the ULID the primary key and no table needs a serial.

**The registry is an inventory of *declared* tables, updated in the same change as the migration that
creates the table.** It ships holding one entry: `workspace`, as `workspace-rls` scoped by its own
`id`, with no privileges. It is a row-scoped table — the one row the application may see is exactly
the one `app.current_workspace` names — and classifying it `role-grants` because nothing reads it yet
would describe the present rather than what must be true, and would put the tenant table itself into
the first migration with no policy on it. Adding one later is an `ALTER` against populated data. It
holds no privileges because nothing reads it, and how a workspace is discovered through membership is
still undecided. That entry is the one exception to the same-change rule: `workspace` was declared in
Drizzle long before there was a migration to pair it with.

**Two names are reserved rather than classified.** `TABLE_ACCESS_BLOCKERS` holds `user` and
`verification_attempt` with the reason their read path is unresolved, and G7 fails if either is
declared or migrated. It classifies nothing and satisfies no coverage requirement — it is a
reservation, and removing an entry is part of the same change that decides the mechanism, adds the
table, and tests it. CV-19 owns that decision.

## Consequences

**Positive:** the question a reviewer has to ask about a new table shrinks to one — which class — and
the class dictates everything the gate then demands. An unclassified table fails, a table in two
classes cannot be written down, and a registry entry with no table behind it fails once there is a
migration to compare against. The `nullif` form and the single-permissive-policy rule become
machine-held, where both were prose. And the impossible grant mechanism is out of the accepted set
before anything was built on it, which is the cheapest moment to remove it.

**Negative / cost:** the policy comparison is exact against `pg_get_expr` output, so it depends on
how Postgres chooses to print an expression. That cost is paid by deriving the expected string at
runtime, from a policy the script writes itself on the server being checked, rather than pinning a
literal - a printing change moves both sides together. What remains is that any *legitimate*
variation in a policy is a failure: there is one accepted spelling and a migration has to reproduce
it. That is deliberate, because the alternative is a substring match, and a check that
`true or workspace_id = nullif(...)` passes is not a check.

Reading privileges with `has_table_privilege` rather than the information schema means the gate sees
effective access - direct, inherited through a group role, `PUBLIC`, column-level - and so fails on
grants a reviewer might call harmless. A table whose entry declares `SELECT` and which also holds it
through a group role is a finding, because the registry is meant to be the single answer to what the
application may do to that table.

Refusing views and materialized views outright is the bluntest decision in this record. It means the
first person who needs one hits a red build with no registry entry available to them, and has to
write an ADR before proceeding. That is the intended cost: both were demonstrated leaking a tenant
table in full, a view because it runs with its owner's rights unless `security_invoker` is set and
migrations run as the owner, a materialized view because row-level security never applies to reading
one at all.

Two structures instead of one is a cost paid deliberately. `TABLE_ACCESS_BLOCKERS` could have been a
fourth class, and was not, because a class whose only assertion is "nothing is asserted" is a vacuous
gate wearing a type.

Every table now carries a required decision about privileges at the moment it is declared, which is
more friction per table than a name in a list. That friction is the point.

Removing the default grant moves a failure from silent to loud, and it does move one: a migration
that creates a table and forgets its grants produces a table the application cannot read, and the
error arrives at the first query rather than in CI. That is accepted deliberately — the failure it
replaces is a table the application can read every row of, which produces no error at all.

**Rejected alternatives:**

- *`IDENTITY_TABLES` as a subset of `NON_TENANT_TABLES`.* The obvious minimal fix, and the one the
  ticket opened with. Two inventories, one nested in the other, with exactly-one-membership still a
  loop to write, and still no place to say what a table with no policy is relying on instead.
- *Keeping the lists independent.* What existed. A reviewer holds the connection between two records
  in their head, which is the arrangement that produced this ticket.
- *Classifying by domain, with `identity` as a class.* Reads better and cannot be enforced: two of
  the three identity tables must not have the policy the third requires.
- *Keeping `TENANT_TABLES` as a derived export.* Free, and it would keep six documents technically
  accurate while the term they use no longer names anything the gate reads.
- *One permissive policy per command.* Four entries per table for the same guarantee. A forgotten
  command is default-deny rather than open, so this is not unsafe — it is more surface for a later
  permissive policy to hide in.
- *Substring matching on `pg_policies.qual`.* Cheap, formatting-insensitive, and passes
  `true OR workspace_id = nullif(current_setting('app.current_workspace', true), '')::uuid`.
- *Deciding the `user` and `verification_attempt` read path here.* It needs the auth module's real
  read patterns, and choosing between a GUC policy and a `SECURITY DEFINER` function on a guess is
  how the mechanism this record removes got written in the first place.

## Enforcement

`packages/infra/scripts/assert-rls.ts` (G7, `assert:rls`) reads the registry and reports **nine**
subchecks separately, each tagged real or vacuous, because they become real at different moments and
one verdict would let the vacuous ones pass for proven (ADR 0048). **Three are real with no
migrations. Six are vacuous and say so.**

Real today:

1. **Declared schema to registry.** Drizzle tables are enumerated from `schema.ts` by
   `is(value, PgTable)` rather than a hand-kept list, so a table joins the check by existing. A
   declared table in neither `TABLE_ACCESS` nor `TABLE_ACCESS_BLOCKERS` fails; a name in both fails;
   a blocked table that is declared fails with its recorded reason; a blank `reason` fails, because
   TypeScript's `string` admits the empty string; a `scopeColumn` that is not a bare identifier
   fails, because it reaches `create policy` as text. One table is checked by this today,
   `workspace`.
2. **Application role attributes.** `convert_app` is neither superuser nor `BYPASSRLS`, and
   `pg_default_acl` grants nothing on future tables to it or to `PUBLIC`.
3. **Cross-tenant isolation**, behaviourally, on a fixture table the script creates and drops: a
   cross-tenant read returns nothing, an empty context returns nothing, and the owner sees both rows
   so the empty results mean something.

Vacuous until there is a schema, and each says which:

4. **Table ownership.** No table is owned by `convert_app`, so the FORCE requirement has nothing to
   iterate. ADR 0042's amended Enforcement section first called this real today. It is not, and that
   record now says so.
5. **Registry to catalogue**, both directions, including the direction ADR 0042 admitted it never
   checked. Any relation in `public` that is not a table or a partitioned table - a view, a
   materialized view, a foreign table - fails here rather than being ignored.
6. **Tenancy graph.** A NOT NULL `uuid` foreign key to `workspace(id)` forces `workspace-rls` and
   forces the policy onto that column; a `role-grants` table with any transitive foreign-key path to
   tenant data fails; and a row-scoped table's `scopeColumn` must exist, be a NOT NULL `uuid`, and
   either reference `workspace(id)` or be it.
7. **`workspace-rls` policies.** Per table and per partition: RLS enabled and forced, exactly one
   permissive policy, `polcmd` of `*`, `polwithcheck` null, `polroles` exactly `convert_app`, and
   `pg_get_expr(polqual, polrelid)` equal to the canonical expression derived at runtime.
8. **`user-rls` policies.** The same, against `app.current_user`.
9. **Effective privileges.** Read with `has_table_privilege` and `has_any_column_privilege`, so
   column grants and privileges inherited through a group role are visible. Exact match to
   `appPrivileges` for a table, subset for a partition, no `PUBLIC` grant, and none of `TRUNCATE`,
   `REFERENCES` or `TRIGGER` on any class.

**Both of this record's stated gaps were closed on 22 August 2026, the day after it landed**, and
neither is open any more:

- Views and materialized views were refused rather than modelled. **ADR 0051** admits them: every
  view must set `security_invoker = true`, which makes it read its base tables as the invoking role
  so their policies apply, and a materialized view may not reach a row-scoped table at all, checked
  through the dependency graph. Measured on Postgres 16.13, a plain view over a policed table
  returned every tenant's rows where the table returned one, and the same view with the option
  returned one.
- The migration owner's attributes were not asserted, leaving both readings of the tenancy guarantee
  live. **ADR 0052** decides it: the owner must be able to bypass row-level security, because a
  migration operates on every tenant's rows by definition and an ordinary owner turns a backfill into
  `UPDATE 0` that reports success. G7 asserts it on the `DATABASE_URL` connection, asserts the two
  roles are distinct, and asserts `convert_app` is not a member of the owner — that last one being
  the case that would otherwise pass every other check.

Reporting both as open rather than implying they were covered is what made them cheap to close: they
were already written down as absences, in the words this record's own rule requires.

**Verified by making it fail**, against Postgres 16.13 on 21 August 2026, twice - the second time
because the first was not enough.

The first pass injected fourteen defects into one fixture database and confirmed each produced its
own named failure. Two independent reviews then took the result apart and found six shapes that
passed all of it, four of them **real, unprotected tables reading green**, and every one is now a
subcheck above:

- a `role-grants` child table with a foreign key to a `workspace-rls` parent and no tenant column of
  its own, which returned both tenants' rows with no workspace context set. `role-grants` was
  policed by looking for a column named `workspace_id`, so the prohibition was defeated by not
  having the column - the case where the mistake is most tempting and a confident `reason` most
  plausible.
- a partitioned parent, `relkind` of `p`, invisible to queries filtering for `r`: a real tenant
  table with grants and no row-level security, while the gate printed "there are no public tables
  yet".
- a view and a materialized view over a tenant table, invisible for the same reason, both readable
  in full by the application role.
- `TRUNCATE` and `REFERENCES` granted on a tenant table, because the forbidden-privilege check ran
  on every class except the two that hold tenant data.
- `grant select (name) on workspace to convert_app`, invisible to
  `information_schema.role_table_grants`, which shows neither column grants nor group inheritance.
- a `scopeColumn` naming a column that is not the tenant key, producing a policy canonical in shape
  that isolates by the wrong axis.

Running the first version also exposed two defects in the assertion code that no type check could
see: `array_agg` over `pg_roles.rolname` yields `name[]`, which node-postgres cannot parse, so the
role comparison read the string it was handed one character at a time; and the forbidden-privilege
check flagged the table owner's inherent `TRUNCATE`, `REFERENCES` and `TRIGGER`, which come with
ownership rather than from a grant.

The lesson worth keeping is not any individual hole. It is that the gate was verified fourteen ways
by the person who wrote it and still had four, because an author tests the failures they can
imagine. Independent review found all four, and two reviewers given different instructions found
different ones.
