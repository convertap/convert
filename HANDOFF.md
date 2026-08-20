# Handoff

Written 20 August 2026. Read this, then `docs/` for anything it points at.

The precedence rules, the stack, the guardrail commands and the Notion cadence all live in
`CLAUDE.md` and are not repeated here. This file holds the things a fresh session cannot
reconstruct from the repository: what is half-finished, what is unproven, and what will bite.

---

## 1. What the project is blocked on

**Not code. Decisions.** Eleven decisions block writing feature code, and six of those are
product rules owned by the product owner (R1, R2, R3, R8, A1, E6). No amount of engineering
moves them. `packages/infra/src/db/schema.ts` holds `organization` and nothing else, and
`TENANT_TABLES` is an empty array, deliberately: R1 to R3 and R8 decide the shape of contact,
lead and deal, and guessing them means building the schema twice.

Two sessions are the critical path:

- **Stakeholder session.** Agenda already prepared in Notion, under Stakeholders → Sessions,
  "Stakeholder decisions — start the clocks". It covers the three blockers the stakeholder owns
  and the five where an external party controls the timing. It was scheduled for the evening of
  19 August; if it has happened, the outcomes need recording in Decisions and the ADRs writing
  in git in the same sitting.
- **Product-owner session.** The six product rules. Not yet scheduled. This is the one that
  lets feature work start.

**Answer this before either:** does Fabric hold its own Meta Solution Provider status, or does
it wrap Cloud API? It decides whether E1, E2 and E4 stay on the critical path as multi-week
calendar-bound waiting, or move to Fabric and leave. It is a question about the user's own
product, not one for a stakeholder.

---

## 2. Deployment: built, and the deploy path has never run

Two Railway environments in `talented-trust`, both in `ams` (Amsterdam), each with its own
Postgres. Everything is in one region because every render is web → api → db.

| | test | staging |
|---|------|---------|
| Branch | `develop` | `main` |
| api | https://convertapi-test.up.railway.app/docs | https://convertapi-production.up.railway.app/docs |
| web | https://convertweb-test.up.railway.app | https://convertweb-production.up.railway.app |
| Deploy switch | `DEPLOY_TEST=true` | `DEPLOY_STAGING=false` |
| Token | real, workspace-scoped | placeholder `REPLACE_ME_WITH_REAL_RAILWAY_TOKEN` |

The staging URLs still say `production` because Railway generated them before the environment
was renamed. Cosmetic, and worth knowing before someone reads too much into a hostname.

**Railway's deployment triggers are deleted.** Nothing deploys on a push any more. Deploying is
`deploy-test` and `deploy-staging` in `.github/workflows/ci.yml`, gated on
`needs: [guardrails, quality, database, performance]` and bound to a GitHub environment so the
branch policies bind (ADR 0024).

**The single most important open item: the deploy jobs have never successfully run.** The
workflow's push trigger listed `main` only, so `deploy-test` was unreachable. Fixed in **PR #24,
still open**. Once that merges, the next push to `develop` is the first real test, and it ends
by curling `/health` and `/` for a 200. Until that happens, treat the deploy path as unverified.

Two things that first run will tell you, which nothing else can:

- `railway up` uploads the working tree rather than Railway pulling from GitHub, so `.gitignore`
  now affects what gets built. `.railway/` is ignored. Whether that upload behaves identically
  to a git fetch is untested.
- Whether a workspace-scoped token is accepted by `railway up -e <environment>`.

---

## 3. Open pull requests

| PR | What | State |
|----|------|-------|
| **#24** | Fire the workflow on `develop` so `deploy-test` can run | **merge this first** |
| **#22** | Notion changelog that writes its own machine rows | green, needs merging |
| #2–#6 | Dependabot action and eslint bumps | **all fail G2, permanently** |

**The Dependabot problem is a real design flaw, not a chore.** Those PRs edit
`.github/workflows/ci.yml`, and gate G2 demands an ADR alongside any change to that file. A bot
cannot write a decision record, so every future action bump is blocked forever. G2 already
compares only the *semantic* content of `.boundaries.json`; it should do the same for the
workflow rather than firing on any diff. That is a change to a guardrail's own definition, so it
needs its own ADR and its own pull request. Flagged in ADR 0023 and not yet done.

---

## 4. Things that are true and unpleasant

**Tenant isolation can be inert while every check reports green.** `DATABASE_URL` resolves to
the `postgres` superuser, and a superuser ignores row-level security completely, as does a table
owner without `FORCE ROW LEVEL SECURITY`. ADR 0002 makes RLS *the* tenancy boundary. G7 asserts
that RLS is *enabled* on a table, not that the connecting role is *subject* to it, so one
organisation could read another's contacts with a green pipeline above it.

Harmless today because no tenant table exists. **Before the first migration**, `DATABASE_URL`
must name a role that is neither superuser nor table owner, and G7 should grow a second
assertion: connect as the application role, attempt a cross-tenant read, require nothing back.
Recorded in `.env.example` next to the variable, and as a Risk in Notion with impact "Ends the
project", which is not hyperbole for a product whose promise is that an SME's customer list is
its own.

**Three gates pass without checking anything.** Say so rather than reporting a green tick: G7
(no migrations exist, `TENANT_TABLES` is empty), G8 (`tests/integration/` holds only
`.gitkeep`), G9 (`apps/web` is a placeholder, so the budget is trivially met). The table in
`CLAUDE.md` says when each becomes real. G1–G6 and G13–G15 are doing real work.

**The deploy token is broader than the design wanted.** Railway project tokens are scoped to one
environment and need a verified account; verification routes to the plans page, and the GitHub
alternative is already spent because the account is connected and still unverified. So the token
in use is workspace-scoped and reaches both environments and any future project. ADR 0024 says
this plainly. It stops being acceptable when production exists or a real WhatsApp credential
lands.

**No spend limit is set.** `railway usage limit` sets one and it is free. Actual burn is about
5 cents a day for all six services, so roughly $1.50/month — an earlier estimate of $20–30 in
this project's history was wrong by more than an order of magnitude, because Railway bills
consumption rather than provisioned capacity. The trial reads "30 days or $4.97 left". A hard
limit is still worth setting: it is the only protection against a runaway process.

**Point-in-time recovery is off**, with no bucket wired and no backups taken. Correct for a test
environment, wrong for production, and one command (`railway postgres pitr enable`). Backups
stay unproven until one has been restored, which the Definition of Done requires.

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

## 6. Notion, and the mirror pipeline

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
  Actions job cannot read Infisical without a credential of its own.
- **Bash heredocs in this environment mangle `\n` inside Python string literals**, turning the
  escape into a real newline and producing `SyntaxError: unterminated string literal`. Write the
  script with the Write tool, or avoid the escape entirely. This wasted several rounds.
- **`railway config` (infrastructure as code) is unusable on Windows.** The CLI appends
  `?namespace=...` to a raw Windows path instead of a `file://` URL, so the import fails. Service
  settings therefore live in `apps/api/railway.json` and `apps/web/railway.json`, pointed at
  through each service's config-as-code path. `.railway/` is gitignored with the reason.
- **Never pipe a gate through `tail` or `head`.** A pipeline's exit status is the last command's,
  so a failing check sails through and gets committed. Run it bare, then inspect.
- Commits carry their human author only. No agent or tool co-authorship trailers, ever.

---

## 8. If you do one thing

Merge **#24**, push to `develop`, and watch whether `deploy-test` actually deploys. Everything
else in section 2 is written down; that is the only claim in this file resting on a mechanism
nobody has seen work.
