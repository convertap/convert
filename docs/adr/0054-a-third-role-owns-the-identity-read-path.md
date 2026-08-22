# ADR 0054 - A third role owns the identity read path

**Status:** Accepted
**Date:** 2026-08-22
**Supersedes:** -
**Superseded by:** -

## Context

ADR 0047 justified `verification_attempt` having no row-level security with "an honest grant of
insert plus select restricted to the identifier presented". Postgres grants cannot do that. A grant
controls operations and columns and has no concept of a row predicate, so `grant select` on that
table hands `convert_app` every row in it. The same reasoning applied to `user` hands it every
account.

ADR 0050 removed the impossible mechanism, named the rule that replaced it, and left the question
open: `role-grants` controls permitted operations and never row visibility, so a table needing
row-scoped access cannot use that class. Both `user` and `verification_attempt` went into
`TABLE_ACCESS_BLOCKERS`, which fails the build if either is declared before this record exists.

The hard case is not the authenticated read. It is sign-in. Looking a user up by phone or email
happens at the one moment when no principal exists, so there is nothing for a policy to scope
against. Whatever mechanism wins has to return one row or none to a caller who has proven nothing
yet, rather than handing that caller a scoped view of the table it can keep querying.

One more constraint shaped the answer, and it came from a gate rather than from a document. G7
already fails any `SECURITY DEFINER` routine owned by a role that can bypass row-level security,
because ADR 0052 made the migration owner exactly such a role. The gate names its own remedy: own it
with a non-bypassing role, or do not use `SECURITY DEFINER`.

## Decision

**A third database role, `convert_auth`, owns the identity read path.** It is
`nosuperuser nobypassrls`, it owns no tables, and its only job is to own the functions the
unauthenticated paths call.

**`convert_app` gets `EXECUTE` on those functions and no other route to identity data.** The
functions own the predicate, so an unauthenticated caller receives one row or none instead of a
queryable relation.

**Each function names the columns it returns.** The sign-in lookup returns the account id, the
credential material and the account status. Nothing else. A definer function that returns a whole
row rebuilds the leak inside the function, where no gate can see it, so the column list is part of
the decision rather than an implementation detail.

**Every function sets `search_path = ''`** and qualifies every name, which is what G7 asserts and
what stops `convert_app` resolving an unqualified name inside the function to something it created.

**Authenticated reads split by who is being read.** A `user-rls` policy on `app.current_user` covers
a person reading their own account. It cannot cover a workspace member list, because that is one
person reading other people's names, which the policy forbids by design. The member list is a second
definer function, scoped to the caller's workspace through `workspace_member`.

**`verification_attempt` uses the same mechanism**, for the same reason: its writers are
unauthenticated by definition. Insert and verify are both functions owned by `convert_auth`, with no
table privilege for `convert_app`. ADR 0047's rule that the table never stores the code stands, so
the verify function compares a hash.

### `user` carries two policies, one per role

This is the part that was not obvious, and it falls out of the mechanism rather than being chosen
alongside it. Row-level security applies per role, and a definer function executes as its owner.
`convert_auth` is deliberately non-bypassing, so it is subject to `user`'s policy like any other
role. A single self-scoped policy would therefore blind the sign-in function too: inside it,
`app.current_user` still holds whatever the caller set, so the function could not find the account it
was asked to look up.

So `user` gets two policies:

```sql
create policy own_row on "user" for select to convert_app
  using (id = nullif(current_setting('app.current_user', true), '')::uuid);

create policy auth_reader on "user" for select to convert_auth
  using (true);
```

`convert_auth` sees every account because the functions it owns are the only things that run as it,
and each of those functions constrains its own result. `convert_app` sees one row, its own.

**Why two policies do not widen what `convert_app` sees.** The obvious objection is the one
`schema.ts` already states: permissive policies combine with `OR`, so a second one can only widen
visibility. That is true of two policies that both apply to the same role. These do not. A policy
declared `TO convert_auth` is not applicable when `convert_app` is the current role, so it never
enters the `OR` at all. The rule that keeps its force is therefore **one permissive policy per
table and role**, and a second policy applicable to the *same* role must still fail the build. A
gate that counted policies per table would reject this design; a gate that counts them per role
keeps the protection the original rule was written for.

**This extends ADR 0050 rather than contradicting it.** That record requires one canonical policy per
table, with the expected expression derived from the server rather than hardcoded. The rule was
written when every policy was tenant-scoped and every table had exactly one reader. It now has to
admit a per-role pair, and the gate has to check the pair rather than reject the second policy as an
anomaly. A policy is canonical for a table *and a role*.

### What G7 gains

**`convert_app` must not be able to reach `convert_auth`.** The existing reachability assertion hunts
only for roles that bypass row-level security, which `convert_auth` deliberately does not. But it
holds the permissive policy on `user`, so `grant convert_auth to convert_app` would hand over every
account while every current subcheck still passed. That is the same shape of escape ADR 0050's review
rounds kept finding, and it needs its own assertion.

The gate also has to assert that `convert_app` holds no privilege on `user` beyond what the
`user-rls` entry declares, and that every function `convert_auth` owns is `SECURITY DEFINER` with an
empty `search_path`.

## Consequences

**Positive.** The unauthenticated path cannot read the account table, only call a function that
answers one question. A SQL injection anywhere in the application reaches no identity data, because
the application's role has no privilege on it. The mechanism fits the gates as they already stand,
which is why it needs no weakening of G7's definer check. And the column list being part of the
decision means a future column is private until somebody widens a function on purpose.

**Negative / cost.** A third role in every environment. This paragraph originally said "and a
third connection string to provision", including in both Railway environments where the second
one is still an outstanding human step from ADR 0042. **That cost does not exist**, found while
building it on 22 August: a role owns functions without ever connecting, and nothing connects as
`convert_auth`, so it is `NOLOGIN` with no password and no connection string. One fewer
credential to provision and one fewer to leak. Logic moves into the database, which nothing else in this system does, so there is now a place
where behaviour lives that the TypeScript layers cannot see. Every new identity read path is a
migration rather than a query, which is friction by design and will feel like friction. Per-role
policies make the canonical-policy assertion more complex, and a more complex assertion is a
likelier place for a defect than the thing it checks.

**Rejected alternatives.**

- *A policy on an `app.current_user` GUC alone.* It works for a signed-in user reading their own
  account and fails exactly where the problem is. Sign-in would have to set the GUC from an
  identifier the caller supplied and nobody has verified, so the policy would be trusting its input.
  That is not a boundary, it is a formality.
- *A view with `security_invoker = false`.* Cheaper than a function and only able to express a
  constant predicate. The sign-in lookup's predicate is the phone number being presented, so the view
  would have to become a parameterised function to work, at which point it is option two with worse
  ergonomics.
- *`BYPASSRLS` on `convert_auth`.* The obvious way to let the function see every row, and it puts the
  definer routine straight into the class G7 refuses. The refusal is correct: a bypassing owner makes
  every function it owns a hole with `EXECUTE` defaulting to `PUBLIC`.
- *Keeping display names on `workspace_member` so no cross-user read is needed.* Removes the member
  list problem entirely and duplicates name data that then drifts from the account it describes. A
  rename would have two places to land, and only one of them would be checked.
- *Deciding only the sign-in path and deferring authenticated reads.* Would let this record close
  sooner while leaving the blocker to return the first time a screen shows a member list.

## Enforcement

**Built and asserted, in `packages/infra/scripts/assert-rls.ts` (G7) and
`tests/integration/tenancy.spec.ts` (G8).** `user` has left `TABLE_ACCESS_BLOCKERS`;
`verification_attempt` stays, with its reason rewritten, because it lands with the auth module that
writes to it.

`convert_auth` exists in `bootstrap.sql` as `NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE
NOREPLICATION`, owning the two lookup functions and nothing else. G7 is 12 of 12 subchecks real, with
nothing waiting and nothing conditional, and the ones this record is responsible for are:

- **identity functions.** `AUTH_FUNCTIONS` is compared to the catalogue by `(schema, name, argument
  types)`, in both directions: owner, `prosecdef`, volatility, exact `search_path=""`, result columns
  as a set, and an ACL of exactly `convert_app:EXECUTE` with no grant option. Any routine
  `convert_auth` owns in any schema, and any routine in `public` wearing a registered name whoever
  owns it, must be registered.
- **user-rls policies**, counted per table *and role*, so the `auth_reader` policy is required on the
  tables `AUTH_FUNCTIONS` reads and refused everywhere else. A second permissive policy applicable to
  the same role still fails.
- **database roles.** `convert_app` cannot reach `convert_auth`, a bypassing role, or the owner of any
  policed table, by `SET ROLE`, by inheritance, or by holding `ADMIN OPTION` anywhere on the path.
  Reachability is asked with `pg_has_role` rather than walked to a depth.
- **definer routines**, in every schema: none owned by a role that bypasses row-level security, and
  none owned by a role that owns or inherits the owner of a policed table, because a routine runs
  with its owner's privileges and only an owner may disable RLS or alter a policy.
- **schema boundary.** Every other query in the gate reads `public` alone, so that assumption is now
  asserted: outside the system schemas only `public` and `drizzle` may exist, and the application can
  reach neither `drizzle` nor `CREATE` on `public`. `TEMP` is withheld from PUBLIC and from the
  application, and `CREATEDB` from the application.

**Behaviour, not only catalogue.** `tests/integration/tenancy.spec.ts` connects as `convert_app` and
asserts: one workspace and one member row visible; its own account and no other, even by direct id;
the sign-in function returning one row for an account it cannot read and none for an unknown
identifier; nothing at all with no context set, and no error; and SQLSTATE 42501 on `set role
convert_auth`. Four of its seven tests fail if `convert_app` is granted `BYPASSRLS`, which is how the
suite was shown to assert something.

**Every assertion above was verified by building the shape and watching it fail**, across five
independent review rounds that produced ten reproduced findings. The ones worth naming, because each
passed a green gate first: a definer function with the policy and no grant, which failed at runtime
with `permission denied for table user` while every catalogue subcheck passed; a seventeen-edge
membership chain, past a depth bound; a role granted `WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`,
which reports no reachability and can grant itself `SET ROLE`; a convergent graph where an inert edge
discovered a role before the ADMIN-bearing path to it; a definer routine whose owner merely
*inherits* the table owner; and a plain owner-context view in another schema, which returned every
account while the gate reported zero views.

### What is not asserted, deliberately or otherwise

Five rounds of review did not stop finding things, so this list is the honest state rather than a
claim of completeness. **Each item below requires the migration owner to create the shape**: the
application role holds no `CREATEROLE`, no `CREATE` on `public` or the database, and no `TEMP`, so it
cannot construct any of them itself. These are defences against a mistaken or hostile migration
passing review, not against the application escaping at runtime.

- **Sequence privileges.** Outside `TABLE_ACCESS`, so `grant update` on a sequence passes. No sequence
  exists, because ADR 0043 makes every key an application-supplied ULID, and `bootstrap.sql` grants
  `usage, select` on sequences deliberately.
- **`convert_auth`'s own `CREATEROLE` and `REPLICATION`.** Asserted for `convert_app`, not for the
  identity role. `bootstrap.sql` sets both off; nothing checks that it did.
- **The single-schema inventory is asserted, not inspected.** The gate refuses a second application
  schema rather than reading it. If one is ever wanted, the registry has to carry schema-qualified
  identities and every query above has to widen, which is a change to ADR 0050 and to this section.
- **Point-in-time snapshots.** The gate runs several statements on more than one connection, so a role
  or DDL change between them is not detected. Serialising deployment against role administration is an
  operational precondition rather than something this file can prove.
- **Foreign tables, procedures beyond the registry check, and event triggers.** Not modelled. A
  foreign table is already refused by relation kind; the other two are unexamined.
