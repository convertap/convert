# ADR 0042 - Two database roles, so row-level security is not advisory

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** 0050, in one part only — the table classification inventory. `TENANT_TABLES` and `NON_TENANT_TABLES` are replaced by one registry keyed by table name; everything else here stands

## Context

ADR 0002 makes row-level security *the* tenancy boundary. `HANDOFF.md` §4 has recorded since 20 August that it may not actually be one, and rates the impact as ending the project — which is not hyperbole for a product whose promise is that an SME's customer list is its own.

The Postgres 16 documentation is unambiguous, and it was read rather than remembered:

> "Superusers and roles with the `BYPASSRLS` attribute always bypass the row security system when accessing a table. Table owners normally bypass row security as well, though a table owner can choose to be subject to row security with `ALTER TABLE ... FORCE ROW LEVEL SECURITY`."

Three things follow, and the first is the one that matters most:

- **`FORCE ROW LEVEL SECURITY` cannot rescue a superuser or a `BYPASSRLS` role.** It only removes the *table owner's* exemption. A design that relies on FORCE while connecting as a superuser is not partially protected; it is unprotected.
- A table's owner bypasses its policies unless FORCE is set.
- So the connecting role must be neither superuser, nor `BYPASSRLS`, nor the owner.

Two facts about this project's actual setup were established while working this decision, and both were worse than assumed.

**Railway hands out the `postgres` superuser**, and `DATABASE_URL` still uses it. `.env.example` has warned about this since 20 August without it being fixed.

**Gate G7 connects as that superuser too.** The CI job passes `DATABASE_URL: postgres://postgres:postgres@localhost:5432/convert_test`. So the gate that exists to prove tenant isolation was asserting *"RLS is enabled"* from a connection that ignores RLS entirely. Every policy could be perfect and every tenant still readable by every other, with a green tick above it. That is a false comfort rather than a gap.

A third fact, incidental but worth recording: `DATABASE_URL` is **not in Infisical** — only `NOTION_TOKEN` is. It exists solely as a Railway service variable pointing at `postgres.railway.internal`, which is private networking and unreachable from a developer machine or from CI. So there is currently no way to verify the real database's role from outside Railway.

## Decision

**Two roles, two connection strings, in every environment.**

| Variable | Role | Allowed to do |
|----------|------|---------------|
| `DATABASE_URL` | owner | DDL: migrations and the bootstrap. Reads the catalogue |
| `DATABASE_URL_APP` | `convert_app` | Rows only: `select`, `insert`, `update`, `delete` |

**The application connects with `DATABASE_URL_APP` and never with `DATABASE_URL`.**

**`convert_app` is created `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`**, and is explicitly denied `CREATE` on the schema. Those attributes are the decision; the rest is plumbing. It cannot own a table, so it cannot disable RLS on one, and it cannot create a table that escapes `TENANT_TABLES`.

**Every tenant table is additionally marked `FORCE ROW LEVEL SECURITY.`** Belt and braces: `convert_app` is not the owner, so FORCE is not strictly required, but a future migration that changes ownership should not silently open the boundary.

**The role is created by `packages/infra/src/db/bootstrap.sql`, run by `pnpm --filter @convert/infra bootstrap` before migrations.** Idempotent, so it runs on every deploy. The password arrives as `APP_DB_PASSWORD` and is bound as a query parameter rather than interpolated into SQL — a `DO` block cannot take parameters, so it is set with `set_config` and read back with `current_setting`.

**G7 gains a second assertion, and it is no longer gated on migrations existing.** This is the part that turns the record into a property:

- Connect as `DATABASE_URL_APP` and assert `rolsuper` and `rolbypassrls` are both false.
- Assert no *declared* tenant table is owned by the application role without FORCE.
- Where `TENANT_TABLES` is empty, say so out loud — the script prints that no cross-tenant read was attempted and that the gate is not yet proving isolation. A gate that passes because there is nothing to check must announce it.
- If `DATABASE_URL_APP` is missing, **fail** rather than skip. A silently skipped tenancy check is the thing being fixed.

Ungating matters more than it sounds. The role check is meaningful with zero tables, and gating it behind "do migrations exist" is *why* G7 stayed vacuous. It now does real work today.

## Consequences

**Positive:** the property ADR 0002 depends on becomes machine-checked, on every pull request, before any tenant table exists — so the first migration lands into a database where the boundary is already proven rather than one where it is hoped for. Splitting DDL from row access also means a compromised application credential cannot alter a policy, only read and write rows the policies permit. And G7 stops being one of the three gates that pass without checking anything.

**Negative / cost:** two connection strings per environment is more configuration to get wrong, and the failure mode of getting it wrong — pointing the application at `DATABASE_URL` — is silent in exactly the way this record is about. The assertion catches it in CI, not at runtime. The `database` CI job now installs dependencies unconditionally, adding roughly half a minute to every run.

Migrations now need the owner credential in production, so a deploy carries two secrets rather than one. `APP_DB_PASSWORD` must match the password inside `DATABASE_URL_APP`, which is a duplication that will drift; the bootstrap resets the password on every run, so drift resolves in favour of `APP_DB_PASSWORD`, and that is worth knowing before someone changes one and not the other.

**And the real database is still not fixed.** This record and its gate make CI honest. Railway's `DATABASE_URL` still names the superuser, and changing it requires a human to run the bootstrap against each environment and repoint the variable — there is no way to do it from here, because the database is on private networking. Until that is done, the gate proves the *design* works and the production boundary remains exactly as weak as `HANDOFF.md` §4 says.

**Rejected alternatives:**

- *One role, with `FORCE ROW LEVEL SECURITY` everywhere.* The obvious economy, and it is what the earlier `.env.example` note gestured at. Rejected on the documentation: FORCE does nothing for a superuser or a `BYPASSRLS` role, so this only works if the single role is neither — at which point migrations cannot run as it, and there are two roles again.
- *Keep asserting RLS is enabled, and trust the connection string.* Free. Rejected because it is what already produced a green gate over an unprotected database.
- *Assert isolation with a real cross-tenant read now.* The strongest possible check, and it needs a tenant table, which needs the first migration, which this ticket blocks. The assertion is written so that the cross-tenant read is the obvious next addition, and the script says out loud that it is missing.
- *A separate schema per tenant instead of RLS.* Sidesteps the role problem. Rejected in `architecture.md` §7 already, at this size, and reversing that would be a redesign rather than a fix.
- *`SECURITY DEFINER` functions as the only write path.* Genuinely strong, and it makes every query a function call. Too large a change to the query layer to justify against Drizzle (ADR 0017).

## Enforcement

- **G7**, extended and ungated: `assert:rls` fails if the application role is superuser or `BYPASSRLS`, if a declared tenant table is owned by it without FORCE, or if `DATABASE_URL_APP` is absent. **Two of the three are real today.** The ownership check is not: `convert_app` owns no table, and cannot, so the loop has never had anything to iterate — this bullet claimed otherwise until 21 August 2026, and G7 now reports that half as vacuous in its own line rather than inside a passing summary (ADR 0050).
- **The classification half of this gate is now ADR 0050's**, which replaced `TENANT_TABLES` and `NON_TENANT_TABLES` with one registry in `packages/infra/src/db/access.ts`. The two-list arrangement described above no longer exists in the code, and the one-directional weakness it admitted — a name with no table behind it passing — is checked in both directions there. Read 0050's Enforcement section for what each half proves today; the short version is that classifying `workspace` from its Drizzle declaration is real now, and everything requiring a public table is still waiting on the first migration.
- **Both composition roots read `DATABASE_URL_APP` and refuse to boot without it**, with no
  fallback to `DATABASE_URL`, and a unit test per runtime holds that shut. Added 21 August 2026
  after review found `apps/api` and `apps/worker` both reading the owner's credential — this
  record's central rule, contradicted in the only two places it applies, from the day the record
  was accepted. The test that matters is the third one: it sets `DATABASE_URL` alone and requires
  a throw, because a fallback there would boot cleanly, answer every query, and leave tenant
  isolation off while G7 still passed. Verified by reintroducing the fallback and watching it
  fail.
- **`bootstrap.ts` asserts the attributes it just created** rather than trusting the SQL ran as written. Its password context and DDL execute in one transaction, as do every context-dependent query in `assert-rls.ts`, so a pool cannot move the second statement to another connection.
- **`apps/api/railway.json` runs bootstrap and migrations as pre-deploy commands** and Railway probes `/ready`, which performs a query through `DATABASE_URL_APP`, before switching traffic.
- The outstanding human step is provisioning `APP_DB_PASSWORD` and `DATABASE_URL_APP` in both Railway environments. `DATABASE_URL` remains the owner credential for pre-deploy DDL. The step is recorded in `HANDOFF.md` §4 and `docs/deployment-runbook.md`; it is not done from this repository.
