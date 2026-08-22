# ADR 0053 - Postgres 18 everywhere, declared in one file

**Status:** Accepted
**Date:** 2026-08-22
**Supersedes:** -
**Superseded by:** -

## Context

CI and local development ran PostgreSQL 16. Both deployed environments run PostgreSQL 18. The gap
was confirmed on 21 August 2026 by reading the Railway services — `staging` and `test` each run
`ghcr.io/railwayapp-templates/postgres-ssl:18` — and measured on 22 August by asking the server
itself over `railway ssh`, since the Postgres service is on private networking and unreachable from a
developer machine or from CI. It answered `PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2)`.

So every database behaviour this repository has proven was proven two majors behind what serves
traffic. Five accepted records carry evidence measured on 16:

| ADR | The evidence |
|-----|--------------|
| 0042 | the policy expression, and that RLS applies to `convert_app` |
| 0044 | enum ordering, which is why deal stage sorts in funnel order |
| 0050 | a plain view over a policed table returning every tenant's rows |
| 0051 | a view running with the invoker's rights |
| 0052 | the owner needing `BYPASSRLS`, and `assert:rls` exiting 3 without it |

A sixth, **ADR 0046**, carries the column-conventions probe and names no version at all. It was run
on 16 like the rest, so it inherits 16 while reading as though version does not apply to it. That is
the worse case of the two, because nothing in the text asks to be re-run.

Neither the policy expression nor enum ordering was likely to differ on 18. The point of a gate is
not to rely on likely, and the gap was not narrow: it spanned two majors, and it opened silently.
Nothing compared the two numbers, because the version was written in six places in this repository
and a seventh in Railway's service configuration, kept in sync by hand and in practice by nobody.

Two facts fixed the timing. **CV-12 writes the first migration**, and a migration should be authored
and proven against the version it runs on; correcting this after there are tables is strictly harder
than before. And a Railway Postgres major is not downgradable in place, so matching CI by moving
Railway means a new service and a data move — expensive forever, and cheap only right now, while the
schema is empty. That asymmetry expires with the first migration.

Upstream removed the remaining doubt. Postgres 18 has been generally available since September 2025;
the current minors as of 13 August 2026 are 18.6, 17.11 and 16.15, and **19 Beta 3 is already
released**. The worry that 18 was too new for Drizzle, `pg` and the `postgres-ssl` template no longer
holds, and choosing 16 would mean deliberately sitting further behind the moment Railway's template
tag moves again.

## Decision

**PostgreSQL 18 is the version, in CI, in local development and in both deployed environments.** CI's
service container is `postgres:18` and `docker-compose.yml` is `postgres:18-alpine`. Railway is
unchanged; it was already there.

**The major is the decision and the minor is only evidence.** CI and Compose track the major tag and
let minors float, which is what Railway's own `:18` tag does, so a security release is exercised
without a commit. Evidence lines name the minor they were measured on, and are never rewritten when a
minor ships. This also names the smaller mistake underneath the big one: ADRs 0050 to 0052 pinned
`16.13` inside Decision sections that can never be edited, and 16 shipped 16.15 three days before
this record.

**One declaration, and a gate that fails when the copies disagree.** `.postgres-version` at the
repository root holds `18` and nothing else. Six files carry a declaration anchored for the gate to
find: `.github/workflows/ci.yml`, `docker-compose.yml`, `docs/architecture.md`,
`docs/pre-development-checklist.md`, `CONTRIBUTING.md` and `CLAUDE.md`. **Gate G16**,
`tools/check_pg_version.py`, makes two assertions:

1. every anchored declaration names the major in `.postgres-version`;
2. no line in those six files names a *different* major unless that line carries
   `pg-version:historical=<major>`, naming the major it excuses — a deliberate reference to the
   version something used to run on.

The declaration grammar is fixed and documented in the gate: `PostgreSQL 18`, `Postgres 18`,
`PG 18`, `postgres:18`, `postgresql:18`, with an optional pinned minor, of which only the major is
compared. The anchor is `<!-- pg-version -->` in Markdown, where it is invisible when rendered, and
a trailing `# pg-version` comment in YAML. A reader who finds the anchor learns that a gate reads that line.

**`docs/adr/` is outside the sweep, deliberately and permanently.** An accepted record's evidence
states the version it was measured on. That is a historical fact, not drift, and a gate that pushed
it toward the current major would be rewriting the archive to make itself green.

**G16 runs in CI's existing `guardrails` job and in the pre-push hook.** It is stdlib Python with no
network and no database, which is the bar the other pre-push checks meet. **The job's display name is
not changed** even though it now runs one more gate: branch protection matches the four CI jobs by
their exact display name, so renaming one turns a required check into a missing check.

**CI runs Docker Hub's `postgres:18`, not Railway's `postgres-ssl:18`.** Railway's `test` environment
reports `Debian 18.6-1.pgdg13+2`, the same pgdg Debian build the official image ships; the template
is that image with TLS enabled. TLS changes the transport and changes nothing that row-level
security, a policy expression or an enum's sort order depends on. Pulling a third-party image into
every CI run would add a supply-chain dependency and a TLS setup step to buy a difference the proofs
cannot observe.

**Compose mounts `/var/lib/postgresql` and uses a new named volume, `convert-pgdata-18`.** Postgres
18's official image made `PGDATA` version-specific — `/var/lib/postgresql/18/docker` — and moved its
declared `VOLUME` from `/var/lib/postgresql/data` to `/var/lib/postgresql`. Mounting the old path on
18 does not persist the cluster, so the mount had to move with the image; and 18 refuses to start on a
16 data directory, so reusing the name would hand every existing checkout a boot loop whose message
does not name the cause. The old `convert-pgdata` volume is left in place, unreferenced and safe to
delete, and `CONTRIBUTING.md` says so. Nothing needs migrating out of it, because there is no schema
yet.

**Every proof is re-run on 18, not amended to claim 18.** All six, including ADR 0046's, on the
version that serves traffic. The results are in Enforcement below, and each affected record gets a
one-line pointer in its own Enforcement section. **No Decision section is edited.**

## Consequences

**Positive.** The gates now assert things about the version that serves traffic, which is the only
version whose behaviour matters. The first migration will be authored, generated and proven on 18
rather than retrofitted to it. The drift that produced this record cannot reopen quietly: six
declarations are machine-checked against one file, and a seventh — Railway's image tag — is on the
weekly reconciliation list in `docs/deployment-runbook.md`. Floating the minor means security releases
arrive in CI without anyone deciding to allow them.

**Negative / cost.** G16 cannot see Railway. It compares this repository against itself, so a Railway
template that moves to 19 is caught by a human reading one tag a week, not by a build. That was chosen
over putting a third-party API and a credential on the critical path of every build, and it is a real
hole rather than a covered one. Floating the minor also means CI can change behaviour without a commit
touching the repository, which is the same property described as positive one paragraph up, read from
the other side: a failure after an 18.x release will look unexplained until someone checks the
version. Everyone with an existing checkout has an orphaned Docker volume and a new one, costing disk
until they delete it. And the escape hatch is honest but abusable: `pg-version:historical` silences a
line, so a review that waves it through hides exactly the drift the gate exists to catch.

**Rejected alternatives.**

- *Pin Railway to 16 and leave CI alone.* What runs would then be what is proven, and today it is
  cheap, because the schema is empty. It spends a database migration to arrive at an older major with
  a shorter supported life, chosen for no reason except matching a CI file — and Railway majors are
  not downgradable in place, so it means a new service and a data move.
- *Run CI against both majors.* Honest, and it roughly doubles the `database` job, already the
  longest, against a 2,000-minute allowance if this repository ever goes private. It buys coverage of
  a version nothing should be running once this record lands.
- *Pin the exact minor, `postgres:18.6`.* Buys nothing here. The gate derives the expected policy
  expression from the live server rather than hardcoding it, which is precisely why the 16-to-18 gap
  did not already break it, and a pinned minor guarantees drift from Railway's floating `:18` within
  weeks. Recording the minor as evidence keeps the fact without freezing it.
- *Check Railway's image tag from CI over its API.* The one thing G16 cannot do, and the only option
  that would have caught the original drift automatically. Rejected because it puts a third-party API
  and a stored credential in the path of every build, so a Railway incident becomes a red build on
  unrelated work.
- *Fold the check into an existing gate, unnumbered.* An unnumbered check cannot be cited in a review
  and does not appear in the gate list in `docs/engineering-guardrails.md`, which is where someone
  looks to find out what is enforced.
- *Rename the `guardrails` job to mention G16.* Consistent with how the other job names read, and it
  breaks the required status check until someone updates branch protection by hand. The naming
  inconsistency is visible in one file; a missing required check is visible to nobody.
- *Let `docs/architecture.md` §3 be the source and have the gate parse the prose.* Makes an editorial
  sentence load-bearing. G15 exists because prose and machines fight over the same text; a
  three-character file does not have that problem.
- *Edit ADR 0042 and ADR 0044 to say 18.* The cheapest-looking option and the one that destroys the
  archive's value. A record states what was decided and what was measured when it was written. The
  correction belongs in a new record with pointers back, which is what this is.

## Enforcement

**Gate G16**, `tools/check_pg_version.py`, in the `guardrails` CI job and in `lefthook.yml`'s
pre-push set. Stdlib Python, no network, no database. It reads `.postgres-version`, requires every
registered file to carry at least one anchored declaration naming that major, and fails any line in
those six files naming a different major that the line's hatch does not name. The sweep matches
any major rather than the current range, because a check hardcoded to 10-19 goes blind the moment the
declared major passes it — the same shape of mistake as the gap this record closes.

The hatch **names the majors it excuses** — `pg-version:historical=16` — rather than excusing a
whole line. Independent review of this change found the bare form was a bypass: `CONTRIBUTING.md`
carries a historical 16 and a current 18 on one line, so a wrong current major there was silenced
completely. It was found by mutating that 18 to 17 and watching the gate pass.

**Verified by making it fail.** With `.postgres-version` set to `19`, every one of the six
registered files contributes at least one named failure and the gate exits 1; restored, it passes
with six anchors across six files. Three mutations that a narrower gate would have missed each fail
as they should: a wrong current major on a hatched line, `PG 17`, and `postgresql:17`. The count of
failures is deliberately not recorded here — it moves whenever a sentence is reworded, and the
invariant worth asserting is that no registered file stays silent.

### The re-verification, 22 August 2026

Every proof the affected records made on Postgres 16 was **re-run**, not amended. Two servers were
used: `postgres:18`, reporting `PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2)`, which is the same build
family Railway's `test` environment reports; and `postgres:18-alpine`, reporting
`PostgreSQL 18.6 on x86_64-pc-linux-musl`, which is what `docker-compose.yml` now runs locally. Every
number below is quoted from those runs.

**The proofs are a committed script, not a transcript**: `tools/reprove_postgres_behaviour.sh`
starts a throwaway container on the major named in `.postgres-version`, runs all six, and writes
`.reports/postgres-<major>-proofs.md`. Review pointed out that prose describing a measurement is not
a measurement anyone else can repeat, which is the same objection ADR 0048 makes about gates. Run it
when the declared major moves; that is the only time the question arises.

**The harness aborts rather than proving the wrong thing**, and that too was verified by making
it fail. Its first run hit a leftover container holding port 55432, so `docker run` failed and
`assert:rls` reported a pass against a stale Postgres. It now reads `server_version` off the
container it started and exits 1 naming the mismatch before any proof runs — confirmed by putting
a Postgres 16 on that port and watching it refuse.

| # | ADR | What was re-run | Result on 18.6 |
|---|-----|-----------------|----------------|
| P1 | 0042 | `assert:rls`, the derived policy expression, the naive-form fail injection | **identical to 16** |
| P2 | 0044 | enum ordering by column and by `::text` | **identical to 16** |
| P3 | 0046 | the conventions probe and its inverse | **identical to 16** |
| P4 | 0050 | a plain view over a policed table | **identical to 16** |
| P5 | 0051 | view, `security_invoker` view, materialized view | **identical to 16** |
| P6 | 0052 | a non-bypassing owner must exit 3 | **identical to 16** |

**P1, ADR 0042.** `assert:rls` on the empty schema reports `3 of 10 checks proved something; 5 wait
for a schema; 2 may never fire` — the same counts, in the same categories, as on 16. The expression
the gate derives from the server is byte-identical to the 16 string:

```
(workspace_id = (NULLIF(current_setting('app.current_workspace'::text, true), ''::text))::uuid)
```

That it survives a two-major move is not luck. The gate derives the expected string from the server
being checked rather than pinning it in source, a choice made for a different reason, which happens
to absorb this. The fail injection behaves as ADR 0042 says it must: the naive form without `nullif`,
read with an empty context, raises `ERROR: invalid input syntax for type uuid: ""`, while the
canonical form returns `0` rows.

**P2, ADR 0044.** `order by stage` gives `new < contacted < qualified < proposal < won < lost`;
`order by stage::text` gives `contacted < lost < new < proposal < qualified < won`. Declaration order
survives, the cast still loses it, and funnel ordering is still the reason the enum won.

**P3, ADR 0046.** The probe table produced the same **seven named failures** and exit 1. The inverse
case — `UPDATE` revoked while `updated_at` is present — still fails with
`UPDATE is revoked but it carries updated_at, a column that can never change`.

**P4 and P5, ADR 0050 and ADR 0051.** Read as `convert_app` with tenant A's context set, against two
rows in two workspaces:

| Relation | Rows visible on 16.13 | Rows visible on 18.6 |
|----------|----------------------|----------------------|
| `lead` | 1 | 1 |
| `v_default` | 2 | 2 |
| `v_invoker` | 1 | 1 |
| `mv` | 2 | 2 |

The owner control still sees both rows. A plain view still leaks every tenant, `security_invoker`
still fixes it, and a materialized view is still unfixable.

**P6, ADR 0052.** With `DATABASE_URL` pointed at a `nosuperuser nobypassrls` role, `assert:rls`
exits **3** and names the role: *"is the migration owner and can neither bypass RLS nor is a
superuser... a backfill becomes UPDATE 0 reporting success."*

**What was not reproduced, stated rather than glossed.** The ticket's earlier measurement of *7 of 10
real with fixture tables* was not re-run, because reaching seven needs tables declared in
`schema.ts`, and there are none. The empty-schema run plus the direct measurements above cover the
same behaviours — the policy expression, isolation, the view classes and the owner's attributes — but
the five *waiting* subchecks are still waiting, on 18 exactly as on 16. They become real with the
first migration, which is now the first migration on 18.

**The local path was run end to end**, not only type-checked: `pnpm db:up` created
`project_convert-pgdata-18`, the container reports `PGDATA=/var/lib/postgresql/18/docker` inside that
volume, the pre-existing `project_convert-pgdata` was left untouched, and `bootstrap` followed by
`assert:rls` both pass against it.

**What nothing enforces.** Railway's image tag. G16 compares this repository against itself and
cannot see the deployed service, so a template that moves to 19 is caught by the weekly
reconciliation step in `docs/deployment-runbook.md` and by nothing else.
