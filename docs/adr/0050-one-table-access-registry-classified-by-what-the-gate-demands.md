# ADR 0050 - One table access registry, classified by what the gate demands

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** 0042, in one part only — the table classification inventory; 0047, in two parts only — `IDENTITY_TABLES`, and the `verification_attempt` access mechanism
**Superseded by:** -

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
  | { kind: 'workspace-rls'; scopeColumn: string }
  | { kind: 'user-rls'; scopeColumn: string }
  | {
      kind: 'role-grants';
      appPrivileges: readonly TablePrivilege[];
      reason: string;
    };
```

A map rather than a set of lists, because membership in exactly one class stops being a property to
check and becomes one the type cannot express otherwise. The cross-list loop that 0042 needed —
which only ever checked one of its two directions — disappears rather than getting fixed.

**`role-grants` controls permitted operations, never row visibility. A table requiring row-scoped
access cannot use `role-grants`.** This is the rule that replaces 0047's `verification_attempt`
paragraph, and it is deliberately phrased as a prohibition, because the failure it prevents is a
reviewer reading "no RLS, narrow grant instead" and believing rows were narrowed.

**The class names what is enforced, not what the table is about.** "Identity" remains a domain
concept, and it belongs in the glossary, where nothing load-bearing rests on it.

**One canonical policy per row-level-security table**, and the gate demands exactly this shape:

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

**A second permissive policy on the same table fails the gate, whatever it says.** Permissive
policies combine with `OR`, so a second one can only widen what is visible, and widening is invisible
in a diff that adds a file. Restrictive policies are permitted and ignored: they combine with `AND`
and cannot broaden. Any future need for asymmetric read and write scope takes its own ADR rather than
an ad hoc second policy.

**The `nullif` wrapper is part of the canonical form, not a style preference.** Without it an empty
context raises `invalid input syntax for uuid` instead of returning no rows, so a forgotten context
becomes a 500 rather than an empty list. ADR 0042 put this in bold and nothing enforced it outside
the fixture table.

**`role-grants` entries declare the exact privileges `convert_app` holds, and a non-empty reason.**
The gate compares the declaration against `information_schema.role_table_grants` in both directions,
rejects any grant to `PUBLIC`, and rejects `TRUNCATE`, `REFERENCES` and `TRIGGER` outright — none of
which row-level security governs, so a policy is no defence against them.

**The bootstrap stops granting table privileges, and each migration grants what its entry declares.**
`bootstrap.sql` held `grant select, insert, update, delete on all tables in schema public` plus an
`alter default privileges` doing the same for every table a later migration creates. The reasoning
was that a new tenant table should not be silently unreadable by the application. It has to go: a
blanket default grant makes every future table fully readable and writable by `convert_app` whatever
its registry entry says, so the registry would describe the intent while the database did something
else — and it would have failed `workspace`'s own entry, which declares no privileges, on the first
migration. Silently readable is the worse of the two failures. Sequence grants stay, and should stay
unused, because ADR 0043 makes the ULID the primary key and no table needs a serial.

**The registry is an inventory of *declared* tables, updated in the same change as the migration that
creates the table.** It ships holding one entry, `workspace`, with no privileges granted, whose
reason records that direct application access waits until workspace discovery through membership is
designed. That entry is the temporary exception to the same-change rule: `workspace` was declared in
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

**Negative / cost:** the structural policy check reads `pg_get_expr(polqual, polrelid)` and compares
it against a canonical string, which is sensitive to how Postgres chooses to print an expression.
That is a real maintenance cost, and it is accepted because the alternative — a substring match for
`nullif` — passes `true OR workspace_id = nullif(...)`, and a check a hostile expression passes is
not a check. If a Postgres upgrade changes the printed form, G7 fails loudly on a policy that is in
fact correct, and the fix is to re-derive the canonical string, not to loosen the match.

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

`packages/infra/scripts/assert-rls.ts` (G7, `assert:rls`) reads the registry and reports five
subchecks separately, because they become real at different moments and a single summary line would
imply the vacuous ones were proven:

1. **Declared schema to registry — real today, one table.** Drizzle table declarations are
   enumerated from `schema.ts` by `is(value, PgTable)` rather than a hand-kept list, so a table joins
   the check by existing. A declared table in neither `TABLE_ACCESS` nor `TABLE_ACCESS_BLOCKERS`
   fails; a name in both fails; a blocked table that is declared fails with its recorded reason.
   `workspace` is checked by this today.
2. **Registry to database catalogue — vacuous until the first migration.** There are no public
   tables, so the loop has nothing to iterate. It is the direction ADR 0042 admitted it never
   checked, and it becomes real with CV-12.
3. **`workspace-rls` assertions — vacuous, no such table exists.** Per table: RLS enabled and
   forced, exactly one permissive policy, `polcmd = '*'`, `polwithcheck` null, `polroles` exactly
   `convert_app`, and `pg_get_expr(polqual, polrelid)` equal to the canonical expression for the
   declared `scopeColumn` and `app.current_workspace`.
4. **`user-rls` assertions — vacuous, `session` does not exist.** The same checks against
   `app.current_user`.
5. **`role-grants` assertions — vacuous until a migration exists.** Actual `convert_app` privileges
   equal to `appPrivileges` in both directions, no `PUBLIC` grant, no `TRUNCATE`, `REFERENCES` or
   `TRIGGER`, and no RLS enabled on a table that chose grant-only control. A blank `reason` fails,
   because TypeScript's `string` admits `''`.

**Verified by making it fail**, against Postgres 16.13 on 21 August 2026, because five of the six
subchecks pass vacuously against the real registry and a vacuous pass proves nothing. A fixture
registry and hand-written SQL put fourteen defects into one database at once — a non-canonical
expression with the `nullif` removed, a second permissive policy, a policy granted to `PUBLIC`, a
policy with `WITH CHECK` set, a table with `FORCE` removed, grants contradicting the declaration,
`TRUNCATE` granted to the application role, a `PUBLIC` grant, row-level security on a `role-grants`
table, a `workspace_id` column on one, an unclassified table, a migrated blocked table, a registry
entry with no table, and a blank reason — and each produced its own named failure. The hostile case
this record rejects substring matching over was tested directly: a policy reading
`true or workspace_id = nullif(...)` fails on the expression comparison.

Running it found two defects in the assertion itself, which is the argument for running it. `array_agg`
over `pg_roles.rolname` yields `name[]`, which node-postgres has no parser for, so the driver returned
the string `{convert_app}` and the role comparison spread it into thirteen single characters — fixed
with `::text[]`. And the forbidden-privilege check flagged the *owner's* `TRUNCATE`, `REFERENCES` and
`TRIGGER`, which come with owning a table rather than from a grant; it now looks only at what
`convert_app` or `PUBLIC` holds. Both would have failed CI on the first migration, and neither is
visible in a type check.

The role checks and the synthetic cross-tenant isolation probe from ADR 0042 are unchanged and remain
real today: the probe is behavioural proof on a fixture table this script creates and drops, where
the catalogue matching above is structural proof about the real schema. Both are needed. The probe
cannot see a table that does not exist yet, and the catalogue cannot prove a correct-looking policy
actually excludes a row.

**Nothing else in this record is enforced, because nothing else exists.** There is no `session`
table, no `user` table, no `verification_attempt` table, and no migration. The canonical policy form
is asserted by code that has never yet had a policy to assert it against — the first migration is
where subchecks 2 through 5 stop being announcements and start being proof. The vacuous-gate ledger
in `CLAUDE.md` names which halves of G7 are which.

The two names in `TABLE_ACCESS_BLOCKERS` are what holds this record's central prohibition. Prose in
an Enforcement section is what ADR 0048 was written about; the blocker list is four lines that fail
the build.
