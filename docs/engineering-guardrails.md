# Engineering Guardrails

How the architecture in [`architecture.md`](./architecture.md) stays true once several people are writing code at speed. Every rule here is either **enforced by a machine** or **listed on a checklist a human signs**. Rules that are neither are aspirations, and this document does not contain any.

Stack is settled: **Next.js web, NestJS on the Fastify adapter, one worker, one Postgres** (ADR 0001, checklist S1).

**Last updated:** 2026-08-18

---

## 1. Repository layout

```
apps/
  web/          Next.js App Router — UI + BFF route handlers that hold the session
  api/          NestJS + Fastify — HTTP interface, webhook ingress, future public API
  worker/       NestJS standalone context — campaign sends, reminders, provider events
packages/
  contracts/    DTOs, error envelope, ULID, pagination cursors — the only shared surface
  core/         framework-free domain + ports; invariants I1–I12 live here
  application/  use cases; take a Principal; shared by api and worker
  infra/        repositories, migrations, provider adapters, queue, observability
tests/
  invariants/   one test per invariant I1–I12 — the executable form of the architecture
  integration/  real Postgres, real migrations
  e2e/          browser flows through web → api
tools/          repo guardrails, runnable without a package manager
docs/adr/       decision records; numbered, immutable once accepted
```

Every layer directory carries a `README.md` stating what belongs in it, what does not, and what it may import. Those files are generated from `.boundaries.json`, so they cannot drift from what CI enforces.

---

## 2. The dependency rule

One direction only. Inner layers never learn about outer ones.

```
web ──────► contracts
api ──────► application ──► core ──► contracts
worker ───► application ──► core ──► contracts
infra ────► core ──► contracts
                     ▲
        composition roots wire infra into api/worker
```

| Layer | May import | Notably may **not** |
|-------|-----------|---------------------|
| `contracts` | nothing | anything |
| `core` | `contracts` | Nest, Fastify, any ORM, any driver, any provider SDK |
| `application` | `core`, `contracts` | Nest decorators, SQL, transport |
| `infra` | `core`, `contracts` | React, Next |
| `api` | `application`, `core`, `contracts` | `infra` outside a composition root |
| `worker` | `application`, `core`, `contracts` | `infra` outside a composition root |
| `web` | `contracts` | `core`, `application`, `infra`, any driver |

**`web` importing `contracts` only is the load-bearing rule of this table.** It is what keeps domain logic out of the browser bundle and the performance budget reachable. Shared types are a convenience; shared behaviour is a leak.

**Enforced by:** `python tools/check_boundaries.py` — first job in CI, before lint or tests. Run it locally before pushing; it takes under a second and needs no dependencies installed.

```bash
python tools/check_boundaries.py            # check
python tools/check_boundaries.py --matrix   # print the allowed-dependency matrix
```

### Composition roots

Only `apps/*/src/composition/**` and `apps/*/src/main.*` may import `infra`. Everywhere else receives ports by injection. This is what makes the WhatsApp provider decision (checklist E3) reversible: swapping Meta Cloud API for a BSP touches one directory.

---

## 3. Gates

Two kinds. A machine gate blocks the merge; a human gate is a checklist line someone signs.

| # | Gate | Kind | Blocks |
|---|------|------|--------|
| G1 | Layer boundaries clean | machine | merge |
| G2 | An ADR accompanies any `.boundaries.json` change | machine | merge |
| G3 | Type check passes with no `any` escape hatches added | machine | merge |
| G4 | Lint passes, no new warnings | machine | merge |
| G5 | Unit tests pass | machine | merge |
| G6 | An invariant test exists and passes for every I1–I12 | machine | merge |
| G7 | Migrations apply to a fresh database, and every tenant table has RLS enabled | machine | merge |
| G8 | Integration tests pass against real Postgres | machine | merge |
| G9 | Performance budget met on the pipeline and contact screens | machine | merge |
| G10 | OpenAPI spec regenerates with no diff, and no endpoint is undocumented | machine | merge |
| G11 | Review checklist signed | human | merge |
| G12 | Definition of Done met | human | story closure |
| G13 | Design token contrast meets WCAG in the shipped theme | machine | merge |

G6 and G7 are the two most easily skipped and the two that matter most. G6 turns the architecture into tests that fail when someone contradicts it. G7 is the difference between multi-tenancy and a data breach with a plausible-looking query.

CI jobs are written so they pass on an empty repository and tighten automatically as the corresponding code lands. A pipeline that is red from day one gets ignored, then disabled.

---

## 4. Invariants as executable specification

`docs/architecture.md` §6 lists invariants I1–I12. Each gets exactly one test file in `tests/invariants`, named for the invariant:

```
tests/invariants/I01-org-scoping.spec.ts
tests/invariants/I02-contact-phone-uniqueness.spec.ts
...
tests/invariants/I12-ulid-external-ids.spec.ts
```

Rules:

- **The test asserts the rule, not the implementation.** I6 does not check that a repository method is absent; it attempts an update through every available path and asserts failure.
- **A missing invariant test fails CI (G6),** whether or not the feature it guards has been built. An unbuilt invariant is a `test.todo` with the invariant text as its name — visible, not forgotten.
- **Changing an invariant requires changing the architecture document and an ADR,** in the same commit. The test file cites the invariant ID so the trail is greppable.

This is the single highest-value measure in this document. Prose architecture rots quietly; a failing test does not.

---

## 5. Non-negotiables that are easy to get wrong

Each of these has bitten similar products. They are here because a reviewer needs to check them by name.

**Tenancy.** Every tenant table has `org_id NOT NULL` and an RLS policy. Never disable RLS to make a test pass — set the org context instead.

**Principal.** Every use case signature starts with a `Principal`. No use case reads an ambient request or a global session. This is what makes the Pro-tier public API additive rather than a rewrite (ADR 0003).

**Money.** Integer pesewas, GHS only. No floats, no decimal strings that get parsed twice. A currency column exists but takes one value for now.

**Time.** Store UTC. Convert at the edge. All "due" and "overdue" arithmetic in `Africa/Accra`. A reminder that fires at the wrong hour destroys trust in the feature that is the product's main promise.

**Phone numbers.** Normalize to E.164 on write, in one function, used by writes *and* by search. A rep typing `024…` must find a contact stored as `+23324…`.

**Append-only history.** `activity` takes inserts only. Corrections are new rows. Withhold `UPDATE`/`DELETE` grants at the database level so the rule survives a well-meaning ORM call.

**Idempotency.** Every job carries a dedupe key. Every webhook handler stores the raw provider event first, keyed on the provider's ID, and stops on duplicate. Provider retries are normal traffic.

**Consent.** Marketing sends check for live consent at send time, in the send path — not in the UI, which can be bypassed by the API and the worker.

**Conversation window.** Free-form WhatsApp sends are rejected before reaching the provider when the 24-hour window is closed, and the UI shows window state. Do not hide an external rule that changes what the user can do.

**Data fetching in `web`.** Server components and route handlers, not client-side effects. The API is a separate origin now, so a client waterfall costs a round trip per hop on a 3G connection.

**No provider SDK above `infra`.** Not in a controller, not in a use case, not "just for now."

---

## 6. Conventions

**Commits.** Conventional Commits: `type(scope): subject`, subject in the imperative, ≤ 72 characters. Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`. Scope is a layer or module (`core/crm`, `api/webhooks`, `web/pipeline`).

No agent or tool co-authorship trailers. Commits carry their human author only.

**Branches.** `type/short-description`, e.g. `feat/lead-capture-form`. Work off `main`; no long-lived branches while the team is this size.

**Naming.** Domain vocabulary from `architecture.md` §6 and the ubiquitous language in `mvp-scope.md`. A `Lead` is not an `Opportunity`; a `Deal` is not a `Sale`. If the product doc and the code disagree on a word, one of them is a bug.

**Error handling.** Errors are a first-class part of the product, not a fallback branch (ADR 0018; `docs/error-handling.md` is the working guide).

Every failure is defined once in `packages/contracts/src/errors.ts` with its HTTP status, retryability, whether it is our fault, and **the sentence a person reads**. Domain and use-case failures are typed and carry a code; one exception filter in `api` maps them to the envelope and logs them — layers below throw without logging. Never render `message` to a user; pick copy by code. No silent catch: catch to add context or convert, then rethrow. Nothing internal reaches a client, and every response carries a `requestId`.

**API documentation.** OpenAPI from day one, generated from the code with `@nestjs/swagger` and committed to the repository as `apps/api/openapi.json`. See §6.1.

**Files.** One exported concept per file. Directory per bounded context, not per technical kind — `core/src/crm/lead.ts`, not `core/src/entities/`, `core/src/services/`.

### 6.1 OpenAPI, from the first endpoint

Swagger is not a launch task. It ships with endpoint number one (ADR 0015).

- **Generated from the code**, via `@nestjs/swagger`. Decorators on every controller and DTO — no hand-written spec to fall out of date.
- **Committed** as `apps/api/openapi.json`. This is the point: an API change becomes a reviewable diff. A breaking change to a response shape shows up in the pull request instead of in a consumer's logs.
- **Gate G10** regenerates the spec in CI and fails on any diff, so the committed file cannot go stale. It also fails on an endpoint with no summary, no response type, or an untyped body.
- **Every DTO carries an example.** A spec with types but no examples is half a document.
- **Error responses are documented**, not just the happy path. The envelope from §6 is a shared schema referenced by every endpoint.
- **UI exposure:** Swagger UI is always on in local and staging. In production it stays behind authentication until the Pro-tier public API launches — an open `/docs` on a production API is free reconnaissance for an attacker.

Two things this buys beyond documentation. First, the Pro-tier public API (`architecture.md` §8) is then a matter of choosing which of the documented endpoints to expose, not writing a spec from scratch. Second, `apps/web` can generate its typed client from the same spec, which keeps the DTO duplication risk in the web/api split from turning into drift.

---

## 7. Definition of a good pull request

Small, one concern, and reviewable in under twenty minutes. Specifically:

- Touches one layer, or one vertical slice through several, but not two unrelated slices.
- Has tests at the level where the logic lives — domain rules unit-tested in `core`, wiring integration-tested.
- Carries no commented-out code, no `TODO` without an issue reference, no `console.log`.
- States what it does **not** do, when scope was deliberately left out.
- Passes the checklist in [`code-review-checklist.md`](./code-review-checklist.md) before review is requested, not after.

If a PR needs a walkthrough to be understood, it is too big or the code is unclear. Both are fixable before review.

---

## 8. The git workflow

`main` is protected. Nobody pushes to it, including the maintainer — GitHub enforces
this for administrators too.

**The loop**

1. Branch: `type/short-description`.
2. Commit in Conventional Commits form. The `commit-msg` hook checks the shape and
   rejects agent or tool co-authorship trailers; commits carry their human author only.
3. Push. The `pre-push` hook runs the boundary, invariant, and contrast checks — the
   three that need no dependencies and finish in about a second.
4. Open a pull request. All four CI jobs must pass, the branch must be up to date with
   `main`, and every review conversation must be resolved.
5. Squash merge. The branch deletes itself.

**Settings, and why**

| Setting | Value | Reason |
|---------|-------|--------|
| Required checks | the four CI jobs | Gates G1–G13 are the merge criteria |
| Strict (up to date) | on | A green check against stale `main` proves nothing |
| Administrators | enforced | A rule the owner can skip is a suggestion |
| Required approvals | 0 | A solo maintainer cannot approve their own PR; `main` would deadlock. Raise to 1 the day a second developer joins |
| Code-owner review | off | Same reason. Turn on with the approval count |
| Linear history | on | Squash-only, so history stays readable |
| Force push / deletion | blocked | — |
| Conversation resolution | required | Stops review comments being merged past |

The zero-approval setting is the one compromise here, and it is temporary. Everything
else — checks, up-to-date branches, no direct pushes, no force pushes — applies to
everyone from today.

**Local hooks** are configured in `lefthook.yml` and installed by `pnpm install`. They
are a faster copy of what CI enforces, not a substitute: `--no-verify` exists for
emergencies, and CI still gates the merge.

---

## 9. When a guardrail is wrong

Guardrails encode decisions, and decisions get superseded. The path is: open an ADR that supersedes the old one, change `.boundaries.json` or the gate in the same commit, and say in the PR body which ADR authorises it.

What is not acceptable is editing a rule to make a red build green. G2 exists specifically to catch that: a `.boundaries.json` change with no accompanying ADR fails CI.
