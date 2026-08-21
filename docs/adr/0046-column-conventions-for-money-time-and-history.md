# ADR 0046 - Column conventions for money, time and history

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

Some decisions repeat on every table. Getting them inconsistent is not one bug; it is one bug per table for the life of the schema, and it makes a schema tiring to read long before it makes it wrong.

Four are already fixed and this record does not reopen them. **I8**: money is integer pesewas, currency fixed to GHS. **I11**: all timestamps stored UTC, with display and all due/overdue arithmetic in Africa/Accra. **I6**: `activity` rows are insert-only. **I12**: every primary key is a ULID in a `uuid` column, supplied by the application.

What they leave open is everything about *how* those rules become columns, and three of the gaps have already produced visible hesitation in accepted records:

- **ADR 0034 says the dormant split fee is stored "in pesewas or basis points."** An accepted ADR containing an unresolved "or" is an open decision hiding where nobody will look for it.
- **ADR 0033 gives `media_asset` a soft delete that refuses while referenced**, and says nothing about whether anything else gets one. A `deleted_at` on every table means every query carries a second mandatory predicate, on top of the one row-level security already imposes, and the query that forgets it leaks rather than errors.
- **CV-11 established that Ghana's indirect taxes do not compound** — VAT 15%, NHIL 2.5% and GETFund 2.5% sit on the same base since 1 January 2026 — so a tax component is a name and a percentage. Nothing said how a percentage is stored, and a percentage stored as a float is the standard way to produce an invoice that does not add up.

There is also a question the ticket did not ask, which turned out to be the interesting one. **I12 already stores creation time**: a ULID's leading 48 bits are the millisecond it was minted, so a `created_at` column is arithmetically redundant with the primary key.

And a vocabulary collision worth catching before it is in the schema: ADR 0032 **deactivates** a member, ADR 0033 **soft-deletes** a media asset. Those look like one mechanism and are not.

The only precedent in the schema is `workspace`, which carries `created_at` and `updated_at` as `timestamp({ withTimezone: true }).notNull().defaultNow()`.

## Decision

**Money is `bigint` pesewas, read as a JavaScript `bigint`, in a column whose name ends `_pesewas`.** Drizzle's `bigint()` takes a `mode` that chooses the inferred type: `mode: 'bigint'`, never `mode: 'number'`. The `number` reading silently truncates past 2⁵³ rather than raising, which is the failure mode already met once in this codebase's history, in a payment adapter. 2⁵³ pesewas is around 90 trillion GHS and no invoice reaches it — the objection is not the ceiling, it is that the default opts into silent wrongness for nothing in return.

**There is no `currency` column.** I8 fixes the currency, so a column would be set on every insert, ignored on every read, and would imply a multi-currency capability nothing downstream implements. A single `CURRENCY = 'GHS'` constant in `contracts` gives the invoice renderer its source. Adding the column later is one migration with a default; carrying it now is a claim on every row that is not true.

**Rates are integer basis points, in a column whose name ends `_bp`.** VAT is `1500`, NHIL and GETFund `250` each. This retires the "pesewas or basis points" in ADR 0034: the dormant split fee uses the same unit.

**Tax is computed `amount * bp / 10000` in integer arithmetic, rounded half-up, per component per line.** Half-up because it is what a Ghanaian invoice and every SME's calculator do, and banker's rounding produces totals a customer disputes. Per component per line because CV-11 established the components stay itemised on the line even though the arithmetic is flat — so the rounded figure is the one printed, and a total recomputed from unrounded values would disagree with the visible lines that make it up.

**No column anywhere is `numeric`, `decimal`, `money`, `real` or `double precision`.** Banning the types is stronger than any naming rule, because it does not depend on someone naming a column honestly.

**Every table carries `created_at`, `timestamptz`, not null** — accepting the redundancy with the ULID. The ULID's timestamp is trapped inside a `uuid` column and only `ulidTime()` in application code can read it, so without the column, "how many leads last week" from psql needs a decoding function nobody has written. Eight bytes for a question anyone can answer from a SQL prompt is a good trade.

**A table carries `updated_at` if and only if it accepts `UPDATE`.** Not a habit, a biconditional. `activity` has UPDATE revoked (I6), `consent` is append-only (ADR 0008), and `payment` is append-only with invoice status derived from the sum (ADR 0034) — an `updated_at` on any of them is a column that can never change, which is worse than an absent one because it invites a reader to trust it.

**`updated_at` is written by a database trigger**, one generic function applied per table, not by the application and not by Drizzle's `$onUpdate`. This looks like it contradicts ADR 0044, which rejected a trigger for lead-status terminality on the grounds that it puts business logic where nobody looks. It does not. What 0044 refused was hiding a *rule* — a branch, with domain vocabulary, that a reader needs to find. `updated_at` is a mechanical fact about a row with nothing to reason about. And the positive argument is ADR 0042's: the database is reachable by a migration, a fix-up script and psql, all of which an application-side hook is invisible to, so the column drifts from the truth exactly when someone is doing something unusual.

**Every timestamp is `timestamptz`. There are no `date` columns, and due points are instants.** Plain `timestamp` accepts a local wall-clock string and stores a number that means nothing without knowing who wrote it, which is what I11 exists to prevent. On the second half: a follow-up reminder fires at a time, not on a day, and the worker sweeps every five minutes, so a `date` would need a time invented at read. Accra being UTC+0 year-round makes this nearly free — a UTC cron `0 9 * * *` *is* 09:00 Accra — but that is a property of Ghana, not of the schema. An invoice due date is stored as an instant at end of day Accra rather than introducing a second temporal type for one column.

**Soft delete is the exception. `media_asset` has `deleted_at timestamptz null`; nothing else does, and adding a second table requires an ADR.**

**Deactivation is not deletion, and does not share its column.** A deactivated member is `deactivated_at`: reversible, still a real member, still present in history, and carrying rules of its own (I7 — their records reassign to a named member or return to the unassigned queue). Using `deleted_at` for it would make a state read as a tombstone. Two words because they are two things.

## Consequences

**Positive:** the conventions are decidable at review time by looking at a column name, and machine-checkable without one. A money column that is a float, a timestamp with no zone, an `updated_at` on an insert-only table, and a `deleted_at` spreading to a second table all fail the build rather than surviving to production. The `_pesewas` and `_bp` suffixes make the unit visible at the call site, which is where unit confusion actually happens.

**Negative / cost:** the suffixes are verbose — `unit_price_pesewas` rather than `unit_price` — and they will read as noise until the first time someone is grateful for them. `mode: 'bigint'` means money arithmetic in TypeScript is `bigint` arithmetic, so no `Math.round`, no mixing with `number`, and JSON serialisation needs an explicit conversion at the boundary. Rounding half-up per component per line has to be implemented once and used everywhere; two call sites rounding differently is exactly the defect the rule exists to prevent, and the rule alone does not stop it.

Accepting the `created_at` redundancy means two sources for one fact. They cannot disagree in practice, because the application supplies both in the same insert — but "cannot in practice" is how the interesting bugs start, and a row inserted by hand with a mismatched pair is possible.

**A gate that is thin, said out loud rather than reported green.** `assert:conventions` currently checks a schema with one table, and against an empty local database it prints that nothing was checked and nothing is proven. It was built now rather than with the first migration on purpose: a convention introduced alongside twelve tables never gets applied to all twelve.

**Rejected alternatives:**

- *`numeric(12,2)` for money.* Exact, readable in psql, and the ordinary answer in most schemas. Rejected because I8 already decided pesewas, and because a decimal type invites decimal arithmetic in application code, where the language has no decimal type and the value becomes a float on the way through.
- *`mode: 'number'` on the bigint.* Simpler in every call site, and no invoice will reach 2⁵³ pesewas. Rejected because the truncation is silent and buys nothing.
- *A `currency` column anyway, as future-proofing.* Rejected: it is the cheapest column to add later and one of the more annoying to carry unused, and its presence would be read as a capability.
- *Percentages as `numeric(5,2)`.* The obvious reading of "15%". Rejected with the rest of `numeric`, and because basis points make the arithmetic integral end to end.
- *`created_at` omitted, decoded from the ULID.* Genuinely tempting and strictly non-redundant. Rejected on ergonomics: it makes every ad-hoc question require application code, and the point of putting a timestamp in the key was never to remove the column.
- *`updated_at` on every table, uniformly.* One rule, nothing to remember. Rejected because on an insert-only table it is a column that can never change, and a reader who trusts it is wrong in a way nothing tells them about.
- *`updated_at` written by the application or by Drizzle's `$onUpdate`.* No trigger, and visible in the code a developer reads. Rejected because it is invisible to migrations, fix-up scripts and psql.
- *Soft delete everywhere, for uniform recoverability.* Rejected: it adds a second mandatory predicate to every query, on top of the tenancy one, and the query that forgets it returns deleted rows rather than failing.
- *One `deleted_at` covering member deactivation too.* Fewer concepts. Rejected because deactivation is reversible, rule-bearing and visible in history, and collapsing the two would either make deactivation look permanent or make deletion look reversible.
- *`date` columns for invoice due dates and task due dates.* Rejected because the worker sweeps on a five-minute schedule and would have to invent a time at read.

## Enforcement

- **`packages/infra/scripts/assert-conventions.ts`**, run as `pnpm --filter @convert/infra assert:conventions` in the G7 job of `.github/workflows/ci.yml`. It reads the catalogue as the owner and privileges with `has_table_privilege` against `convert_app`, and checks all seven rules: banned numeric and float types, `_pesewas` is `bigint`, `_bp` is `integer`, no `timestamp without time zone`, `created_at` present, non-null and `timestamptz` on every table, `updated_at` present exactly when `UPDATE` is granted, and `deleted_at` only on `media_asset`.
- **Verified by making it fail.** A probe table with `numeric` pesewas, a `bigint` basis-point column, a zoneless timestamp, a stray `deleted_at`, no `created_at` and no `updated_at` produced seven named failures and exit 1. The inverse case — `UPDATE` revoked while `updated_at` is present — produced its own failure. The empty schema reports that nothing was proven rather than passing.
- **It refuses to skip.** If `convert_app` does not exist, the `updated_at` rule cannot be evaluated, and the script fails rather than passing quietly — the same reasoning as ADR 0042's refusal to skip when `DATABASE_URL_APP` is absent.
- The `TENANT_TABLES` docstring in `packages/infra/src/db/schema.ts` lists what a tenant table must arrive with, and now carries these conventions, because that is where the next person writing a table actually looks.
