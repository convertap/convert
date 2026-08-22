# Handoff

Written 20 August 2026. Read this, then `docs/` for anything it points at.

The precedence rules, the stack, the guardrail commands and the Notion cadence all live in
`CLAUDE.md` and are not repeated here. This file holds the things a fresh session cannot
reconstruct from the repository: what is half-finished, what is unproven, and what will bite.

---

## 1. What the project is blocked on

**Not code. Decisions — but far fewer than this section used to claim.** It said eleven blocked
feature code, six of them product rules (R1, R2, R3, R8, A1, E6). **All six are decided**: R1–R9
and A1–A6 landed on 21 August 2026 as ADR 0029 to ADR 0040, and E6 as ADR 0037. What remains is
not the same list, and conflating the two sends the next reader looking for settled work: the live
blockers are **E2 and E8**, the legal text of **L2 and L3**, and turning the settled rules into
tables. The first of those is engineering work with no decision left in it. `packages/infra/src/db/schema.ts` holds `workspace` and nothing else, and
`TENANT_TABLES` is an empty array, deliberately: R1 to R3 and R8 decide the shape of contact,
lead and deal, and guessing them means building the schema twice.

Two sessions are the critical path:

- **Stakeholder session.** Agenda already prepared in Notion, under Stakeholders → Sessions,
  "Stakeholder decisions — start the clocks". It covers the three blockers the stakeholder owns
  and the five where an external party controls the timing. It was scheduled for the evening of
  19 August; as of 20 August nothing has been recorded in Decisions and no ADR has appeared, so
  either it has not happened or its outcomes were never written down. Find out which.
- **Product-owner session.** The six product rules. Not yet scheduled. This is the one that
  lets feature work start.

**Answer this before either:** does Fabric hold its own Meta Solution Provider status, or does
it wrap Cloud API? It decides whether E1, E2 and E4 stay on the critical path as multi-week
calendar-bound waiting, or move to Fabric and leave. It is a question about the user's own
product, not one for a stakeholder.

---

## 2. Deployment: the old test route is proven; the promotion route is not

Two Railway environments in `talented-trust`, both in `ams` (Amsterdam), each with its own
Postgres. Everything is in one region because every render is web → api → db.

| | test | staging |
|---|------|---------|
| Branch | `testing` | `staging` |
| api | https://convertapi-test.up.railway.app/docs | https://convertapi-production.up.railway.app/docs |
| web | https://convertweb-test.up.railway.app | https://convertweb-production.up.railway.app |
| Deploy switch | `DEPLOY_TEST=true` | `DEPLOY_STAGING=false` |
| Proven? | old `develop` route only, 20 August | **never run** |

The staging URLs still say `production` because Railway generated them before the environment
was renamed. Cosmetic, and worth knowing before someone reads too much into a hostname.

**Railway's deployment triggers are deleted.** The only deployment pushes are merges into
`testing` and `staging`. Deploying is
`deploy-test` and `deploy-staging` in `.github/workflows/ci.yml`, gated on
`needs: [guardrails, quality, database, performance]` and bound to a GitHub environment so the
branch policies bind (ADR 0024, amended by ADR 0049). The full promotion path is
`develop` -> `testing` -> `staging` -> `main`; `develop` and `main` run gates without deploying.

**`deploy-test` now works, and it took three fixes to get there.** The first was PR #24: the push
trigger listed `main` only, so the job was unreachable. With that merged, `develop` was
fast-forwarded to `main` and the job ran for the first time — and failed immediately:

```
Unauthorized. Please check that your RAILWAY_TOKEN is valid and has access to the resource
you're trying to use.
```

The secret was present. **The variable was wrong**, and this is the single most useful thing in
this section. Railway's CLI does not inspect a token and infer its kind; the variable *is* the
declaration:

| Variable | Token it must hold | Scope |
|----------|--------------------|-------|
| `RAILWAY_TOKEN` | project token | one environment within one project |
| `RAILWAY_API_TOKEN` | account or workspace token | everything in the workspace |

Ours is workspace-scoped, because minting a project token needs a verified account (ADR 0024
§49). Passed as `RAILWAY_TOKEN` it was presented as a project token, matched nothing, and was
rejected — and the error names `RAILWAY_TOKEN`, which reads as "your token is bad" when the token
is fine. Fixed in PR #26, ADR 0026. **Only one of the two may be set; setting both is an error**,
so exporting both is not a fallback.

**And then it was cancelled, which found a second, worse bug.** The next push deployed both
services from one job on a day when Railway queued each build for about ten minutes behind
`scheduling build on Metal builder`. Two serial builds blew the 20-minute bound and GitHub
cancelled the job — *after* `railway up` had already handed the build over. Railway carried on;
both services deployed and served 200. `Prove it serves` never ran. So the deploy happened,
nothing verified it, and the run reported a cancellation, which reads as "nothing happened". A red
job is honest; that was not.

Not the action bumps: `checkout@v7` and `setup-node@v7` ran clean, post-run steps included, and
the stall is inside `railway up`. Not a busted build cache either — the eslint 10 lockfile change
was already present in the fast run.

**Fixed by one deploy job per service** (a matrix, both environments), ADR 0027. `timeout-minutes`
applies per matrix instance so each service gets the full 20 minutes instead of sharing;
the builds overlap; and each job proves the service it deployed, so a cancellation can strand at
most one and the job name says which. `fail-fast: false` is load-bearing — the default cancels the
web deploy mid-build when api fails, recreating the hole.

Run `32380276107` is the proof, and it landed on another slow day, which makes it the better
proof:

| Job | Started | Finished | Probe |
|-----|---------|----------|-------|
| `Deploy api to test` | 14:29:16 | 14:39:41 | `/health` → 200 |
| `Deploy web to test` | 14:29:16 | 14:39:37 | `/` → 200 |

Identical start times, so they genuinely ran concurrently, each about ten minutes inside its own
bound. **Under the old serial design that run would have been cancelled too.** Both endpoints were
still 200 on a manual curl afterwards, so these are running services and not a green tick.

Two things to expect rather than be surprised by: a skipped deploy shows as the unexpanded
`Deploy ${{ matrix.name }} to staging`, because a skipped job never expands its matrix; and each
push now registers two deployments against the same GitHub environment, so any future protection
rule on `test` or `staging` gates both jobs independently.

Two unknowns this run also settled, which nothing else could:

- `railway up` uploads the working tree rather than Railway pulling from GitHub, so `.gitignore`
  affects what gets built. The log shows `Indexing... / Uploading...`, then a railpack build on
  Railway's builder, then a service answering 200. **The upload path builds.**
- A workspace-scoped token **is** accepted by `railway up` with `--project`/`--environment`, but
  only under `RAILWAY_API_TOKEN`, as above.

**Staging remains unproven.** `DEPLOY_STAGING=false`, and a secret named `RAILWAY_TOKEN` exists on
the `staging` environment but its value cannot be read back — it may still be the
`REPLACE_ME_WITH_REAL_RAILWAY_TOKEN` placeholder. The variable fix in ADR 0026 applies to both
jobs, so staging *should* work once the switch flips and the value is real. "Should" is the word
that was wrong about test.

---

## 3. Pull requests

Everything that was open on 19 August has merged. **Do not go looking for #24, #25 or #26 — they
are on `origin/main`.**

| PR | What | State |
|----|------|-------|
| #24 | Fire the workflow on `develop` so `deploy-test` can run | merged |
| #22 | Notion changelog that writes its own machine rows | merged |
| #6 | eslint 9.39.5 → 10.8.1 | merged |
| #25 | Stop G2 firing on an action version bump (ADR 0025) | merged |
| #26 | Pass the Railway credential as `RAILWAY_API_TOKEN` (ADR 0026) | merged |
| #2, #3 | `actions/setup-python` 5→7, `pnpm/action-setup` 4→6 | merged |
| **#4, #5** | `actions/setup-node` 4→7, `actions/checkout` 4→7 | **open, `BEHIND`** |

**The Dependabot deadlock is fixed.** Gate G2 demanded an ADR for any diff to `ci.yml`, and a bot
cannot write one, so every action bump was blocked permanently — security patches included. G2 now
compares the workflow semantically, in the same spirit as its existing `.boundaries.json`
carve-out: every `uses:` line is normalised by dropping the ref it is pinned to and any trailing
`# v4.2.0` comment, and the rest of the file must match byte-for-byte. A step, a trigger, a
`needs:` edge, a `run` body, a deploy environment, or the *identity* of an action still requires a
decision record. ADR 0025.

That it works is not a claim from a test matrix: **#2 and #3 passed G2 and merged on their own
evidence.** #4 and #5 only need `gh pr update-branch` and will follow.

The old direct `develop` -> test deployment path is retired by ADR 0049. The remote `testing` and
`staging` branches still need to be created and protected before the new promotion flow can run.

---

## 4. Things that are true and unpleasant

**The application role exists, and the deployed databases still do not use it.** ADR 0042 created
`convert_app` — not a superuser, no BYPASSRLS, cannot own a table so cannot disable RLS, cannot
create one that escapes the explicit table inventories. CI proves isolation with it on every pull
request, and G7 now fails any public table absent from both inventories.

**Railway does not.** Both environments still connect as the `postgres` superuser, so the
production boundary is exactly as weak as it was. Fixing it is a human step, per environment, and
cannot be done from a developer machine because the database is on `postgres.railway.internal`:

1. Set `APP_DB_PASSWORD` to a generated secret.
2. Add `DATABASE_URL_APP` with the `convert_app` credentials.
3. Leave `DATABASE_URL` as the owner — bootstrap and migrations need DDL.
4. Deploy the API. Railway's pre-deploy commands bootstrap the role and apply migrations before
   traffic changes; `/ready` then proves the runtime credential can query the database.

**And `DATABASE_URL` is not in Infisical.** Only `NOTION_TOKEN` is. The database URL exists solely
as a Railway service variable, which contradicts ADR 0020 and means there is no way to verify the
real database's role from outside Railway. Worth fixing while doing the above.

**Two gates pass without checking anything, down from three.** Say so rather than reporting a
green tick: G8 (`tests/integration/` holds only `.gitkeep`) and G9 (`apps/web` is a placeholder, so
the budget is trivially met). The table in `CLAUDE.md` says when each becomes real. G1–G6 and
G13–G15 are doing real work.

**G7 was the third, and stopped being vacuous on 21 August** (ADR 0042). It now creates a fixture
tenant table, enables and forces row-level security, and proves as the application role that
workspace A sees only A, an empty context sees nothing, and an explicit cross-tenant query returns
nothing — then proves the *owner* still sees both rows, because an empty result that cannot be
attributed to RLS proves nothing. It was verified by making it fail: pointing `DATABASE_URL_APP` at
a superuser produces `is a SUPERUSER, so it bypasses every RLS policy` and exits 1.

Its migration half still skips, because no migrations exist, and the script says so out loud rather
than reporting a bare pass.

**The deploy token is broader than the design wanted, and it now works.** Railway project tokens
are scoped to one environment and need a verified account; verification routes to the plans page,
and the GitHub alternative is already spent because the account is connected and still unverified.
So the token in use is workspace-scoped and reaches both environments and any future project. ADR
0024 says this plainly. ADR 0026 adds the part that changed: making it work raised the value of
leaking it from zero. G14 redacts and `--ci` keeps it off stdout, but the mitigation is
proportionate only while both databases are empty. It stops being acceptable the moment production
exists or a real WhatsApp credential lands.

A comment above the deploy jobs used to claim the test credential "cannot reach staging even if it
tried". It can, and the comment is gone. ADR 0024 §49 had already corrected that about itself; a
comment asserting containment that does not exist is how the real blast radius gets forgotten.

**No spend limit is set.** `railway usage limit` sets one and it is free. Actual burn is about
5 cents a day for all six services, so roughly $1.50/month — an earlier estimate of $20–30 in
this project's history was wrong by more than an order of magnitude, because Railway bills
consumption rather than provisioned capacity. The trial reads "30 days or $4.97 left". A hard
limit is still worth setting: it is the only protection against a runaway process.

**Point-in-time recovery is off**, with no bucket wired and no backups taken. Correct for a test
environment, wrong for production, and one command (`railway postgres pitr enable`). Backups
stay unproven until one has been restored, which the Definition of Done requires.

**E7 is half done and still marked ☐.** Repo, CI and hosting exist. **A domain and error tracking
do not** — nothing in the repository configures either.

**~~The checklist's own decision log is empty.~~ Fixed 21 August 2026.** §10 now carries the
decision rows, and S2, S3 and S6 read ☑ with the record that settled each. S3 was the instructive
one: it looked half decided because ADR 0010 settles the queue and says nothing about a scheduler
— the scheduler is in **ADR 0022**, decided while choosing the hosting rather than while choosing
the queue. An item whose answer is split across two records reads as open forever unless both are
cited. The Decisions database in Notion was reconciled in the same sitting.

---

## 5. The worker is deliberately not deployed

`apps/worker` exists as a service in both environments with no deployment, on purpose. Two
reasons, and the second is the trap:

1. It registers no job handlers. It logs `worker started; no handlers registered yet`.
2. `main.ts` creates a Nest application context and **never exits**. ADR 0022 specifies it as a
   cron service, and Railway *skips* a scheduled run while the previous one is still going. So a
   run that never exits means every later run is skipped silently, and the queue stops draining
   with nothing visibly broken.

It arrives with the first job handler and a drain-and-exit entrypoint, a bounded batch per run,
and a hard timeout. Cron schedule `*/5 * * * *`; Africa/Accra is UTC+0 year-round so a 09:00
Accra reminder is `0 9 * * *` with no offset arithmetic.

---

## 6. Notion, and keeping it current

Workspace: [Convert](https://app.notion.com/p/3c14771f641e809abeb6ddf613dabc2d). Reached through
the claude.ai connector over OAuth, which is **per client**: run `/mcp` once per machine or calls
fail while the connector reports connected.

`docs/notion-mirror.json` registers seven mirrored pages. Gate **G15** compares the manifest
against the working tree and does no network access, so it needs no token and cannot flake.
Diagrams are `verbatim` and a machine owns them; stakeholder prose is `editorial` and a machine
must never rewrite it.

```bash
python tools/check_notion_mirror.py --list                       # what is mirrored from where
infisical run --env=dev -- python tools/push_notion_mirror.py     # publish git-owned diagrams
infisical run --env=dev -- python tools/push_notion_mirror.py --verify   # does Notion match git
```

`--verify` is the only check that catches an edit made *in* Notion; G15 cannot see one. A run
that changes nothing writes nothing and logs nothing.

**Notion is behind by one day of work.** Seven pull requests merged on 20 August, and none of the
Backlog rows have moved, no Definition of Done boxes are ticked, and ADR 0025 and ADR 0026 are not
in Decisions. `CLAUDE.md` treats this as part of the work rather than a separate chore, and a
decided item with an Open row is how a project loses track of itself.

**Notion tripwires**, each of which cost time to find: never name a title property `ID`; date
properties take the expanded `date:Name:start` keys and passing the bare name errors; mention a
person with `user://<uuid>` and never a page URL, because a page URL is silently stored as plain
text; a board hides empty groups and the view DSL cannot change it; a rollup cannot target a
relation or another rollup; DDL statements are all-or-nothing, so add a relation before the
rollups over it.

---

## 7. Environment and tooling notes

- **Secrets come from Infisical**, never a file: `infisical run --env=dev -- <command>`
  (ADR 0020). `.infisical.json` is committed, so a fresh checkout needs `infisical login` only.
  The one exception is `RAILWAY_TOKEN`, which lives in GitHub environment secrets because an
  Actions job cannot read Infisical without a credential of its own. Note the name: the *secret*
  is still called `RAILWAY_TOKEN` while the workflow passes it as `RAILWAY_API_TOKEN`. That
  mismatch is deliberate and explained in ADR 0026 — the value cannot be read back out to rename
  it, so the rename waits for the token to be reissued.
- **Python's locale encoding will silently break a content comparison on Windows.**
  `subprocess.run(..., text=True)` decodes with the locale codec, which is cp1252 here, so a `§`
  read out of git history did not match the same `§` in the working tree and every comparison in
  `tools/check_adr_discipline.py` failed for no visible reason. It now passes `encoding="utf8"`
  explicitly. CI runs on a UTF-8 locale and would never have shown this. Any future tool that
  diffs file contents through `git show` needs the same care.
- **G2 diffs commits, not the working tree.** `check_adr_discipline.py` uses
  `git diff <merge-base>...HEAD`, so running it before committing reports "no rule changed" no
  matter what is in the tree. This produced two false results while verifying ADR 0025 and cost
  real time. Commit first, then run the gate.
- **Bash heredocs in this environment mangle `\n` inside Python string literals**, turning the
  escape into a real newline and producing `SyntaxError: unterminated string literal`. Write the
  script with the Write tool, or avoid the escape entirely.
- **`railway config` (infrastructure as code) is unusable on Windows.** The CLI appends
  `?namespace=...` to a raw Windows path instead of a `file://` URL, so the import fails. Service
  settings therefore live in `apps/api/railway.json` and `apps/web/railway.json`, pointed at
  through each service's config-as-code path. `.railway/` is gitignored with the reason.
- **Never pipe a gate through `tail` or `head`.** A pipeline's exit status is the last command's,
  so a failing check sails through and gets committed. Run it bare, then inspect.
- Commits carry their human author only. No agent or tool co-authorship trailers, ever.
- **`/wayfinder` is installed but not configured, and the decision is parked.** It ships with the
  `mattpocock-skills` plugin, globally, so no install is needed. It and
  `/setup-matt-pocock-skills` are both `disable-model-invocation: true`, meaning an agent cannot
  start them — a human types the slash command. Configuring it needs one answer first: the pack
  supports GitHub, GitLab and local markdown only (Notion is permanently out of scope), and
  **this repository is public**, so filing decision tickets for P1 named pilot SMEs, P6 kill
  criteria and Pro-tier margin as GitHub issues publishes them. The options are a private planning
  repository, public issues, or gitignored local markdown. Nothing has been written; an earlier
  attempt was reverted so no half-configured state is left behind.

---

## 8. If you do one thing

**Provision `APP_DB_PASSWORD` and `DATABASE_URL_APP` in both Railway environments, then run one
deployment through each path.** The repository now bootstraps and migrates before deployment and
probes `/ready`, but configuration on the private Railway databases remains a human-owned step.
After that, start the schema and migration plan; no unresolved repository setup task blocks it.
