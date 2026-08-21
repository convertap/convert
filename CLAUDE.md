# Convert. SME Leads Platform

Mobile-first sales & lead management platform for Ghanaian SMEs. The workspace is scaffolded and the API boots; no feature code exists yet, because the product rules that shape the schema are still open (R1–R3, R8).

## Documents and precedence

1. **`docs/mvp-scope.md`**. Authoritative build scope. Wins on anything in scope.
2. **`docs/product-spec.md`**. Full product vision + commercial model, derived from `Convert_Pitch_Deck.pptx`. Reference for intent, not for scope. §12 holds open questions, §13 the deck-vs-scope divergences.
3. **`docs/pre-development-checklist.md`**. What must be obtained, decided, or proven before implementation starts. IDs (E0–E7, L1–L4, R1–R9, A1–A6, S1–S7, P1–P6) are stable; cite them. §10 is the decision log, record decisions there as they land.
4. **`docs/architecture.md`**. Target architecture. §3 the decided stack, §6 invariants I1–I12, §20 the decisions it still assumes, §21 how the rules are kept.
5. **`docs/adr/`**. 48 decision records. **Accepted:** 0001, 0015–0048. **Proposed:** 0002, 0003, 0005–0014. **Superseded:** 0004, by 0043. Cite by number. Never edit an accepted **Decision**, supersede it — the header and the Enforcement section may be edited, and ADR 0048 requires the Enforcement section to say what exists today rather than what is intended.
6. **`docs/engineering-guardrails.md`**. Layout, the dependency rule, CI gates G1–G14, conventions. With `docs/code-review-checklist.md`, `docs/definition-of-done.md`, `docs/test-strategy.md`.
7. **`docs/error-handling.md`**. Errors are first class (ADR 0018): one catalogue carrying status, retryability, and the sentence a person reads. Layers below the API throw without logging.
8. **`docs/design-system.md`**. Shadcn primitives, Convert token tiers, domain tokens for stage/channel/status/window, accessibility and performance rules (ADR 0016).
9. **`docs/notion-workspace.md`**. Stakeholder-facing Notion workspace: structure, the backlog, sprints and decisions databases, which system owns which fact, and the mirror pipeline (§9).
10. `C:\Users\SolomonAboagye\Downloads\Convert_Pitch_Deck.pptx`, original source. 12 slides.

Do not resolve a scope conflict yourself. If the two docs disagree on something not already in `product-spec.md` §13, add it there and flag it.

## Ground rules for docs

- Do not invent product facts. If neither doc answers it, add it to `product-spec.md` §12 Open Questions instead of filling the gap.
- Amounts are GHS. Keep the deck's figures exact (150/350/700 monthly; 1,500/3,500/7,000 annual; GHS 25/seat overage).
- Keep the two state machines distinct, Lead status (`New → Contacted → Qualified → Converted → Lost`) is not the Deal pipeline (`New → Contacted → Qualified → Proposal → Won/Lost`). The deck conflated them; the scope splits them.

## MVP boundary

In: auth, workspaces, members/roles, contacts, leads, lead sources, one default pipeline, deals, activities, tasks/follow-up reminders, WhatsApp/SMS outbound, lightweight campaigns, in-app notifications, dashboard, search/filter. Responsive web.

Out: quotes, invoices, payments/billing, seat enforcement, AI scoring, multiple pipelines, native apps, integrations/API, cost-per-lead attribution, advanced RBAC. Full list in `mvp-scope.md` §20–21.

Two consequences worth remembering: the MVP ships **no billing**, so tier entitlements must not be hardcoded; and it ships **no cost-per-lead attribution**, so deck problem P2 ("marketing spend is a black box") is not solved by the MVP.

## Highest-risk unknown

WhatsApp integration depth. Meta test credentials, Meta Cloud API direct, third-party BSPs, click-to-chat, and the future internal production provider are materially different paths with different cost, compliance, and template rules. Demo work may use the fastest available test/sandbox/temporary provider path, but production WhatsApp readiness blocks real pilot/customer launch. Treat inbound WhatsApp lead capture as unconfirmed until the demo spike proves it; treat production inbound capture as unconfirmed until the production readiness spike proves it.

## Stack

Decided 2026-08-18 (S1, ADR 0001): **Next.js** web · **NestJS on the Fastify adapter** api · **NestJS standalone** worker · **PostgreSQL 16** with **Drizzle** (ADR 0017) · pnpm monorepo · Postgres-backed job queue (ADR 0010) · OpenAPI generated and committed from the first endpoint (S7, ADR 0015).

**Scaffolded.** pnpm workspace with Turborepo: `apps/api`, `apps/web`, `apps/worker`, and
`packages/contracts`, `core`, `application`, `infra`. The API boots and serves Swagger. Twelve
invariant tests pass. Guardrails G1–G15 run in CI and four of them run before every push.

**What is deliberately not built.** `packages/infra/src/db/schema.ts` holds `workspace` and
nothing else, and `TENANT_TABLES` is an empty array. There are no migrations. That is not an
oversight: R1, R2, R3 and R8 decide the shape of contact, lead and deal, and guessing them means
building the schema twice.

**Two gates therefore currently pass without checking anything, down from three.** Say so rather than reporting a
green tick:

| Gate | Why it is vacuous today | Real when |
|------|-------------------------|-----------|
| ~~G7 migrations and RLS~~ | **No longer vacuous, 21 August 2026.** It creates a fixture tenant table, proves a cross-tenant read returns nothing as the application role, and proves the owner still sees both rows so the result means something (ADR 0042). The *migration* half still skips until migrations exist | the real schema half becomes real with the first migration |
| G8 integration tests | `tests/integration/` holds only `.gitkeep` | there is a repository to test against real Postgres |
| G9 performance budget | `apps/web` is a placeholder page, so the budget is trivially met | the pipeline and contact screens exist |

G1–G6 and G13–G15 are doing real work today.

Hard constraint: **web, api, and Postgres deploy to the same region.** Every render is web → api → db, so a split deployment costs two intercontinental round trips against a 2.5 s LCP budget. Rules out edge-only hosting.

## Messaging adapters

All WhatsApp/SMS integrations must go through the provider-neutral messaging adapter contract. Valid implementations include Meta test credentials for demo, a third-party BSP/provider, Meta Cloud API direct, and the future internal production provider. Do not leak provider-specific payloads or APIs into contacts, leads, campaigns, tasks, activities, or insights.

## Guardrails, run before claiming anything works

```bash
python tools/check_boundaries.py           # layer boundaries (G1). Run before every push.
python tools/check_boundaries.py --matrix   # allowed-dependency matrix
python tools/check_invariant_coverage.py    # every invariant I1–I12 has a test (G6)
python tools/check_contrast.py              # design token contrast, WCAG (G13)
python tools/check_notion_mirror.py         # Notion mirrors current (G15). No network
python tools/check_notion_mirror.py --list  # what is mirrored from where
```

`.boundaries.json` is the executable form of `architecture.md` §5. `apps/web` may import `@convert/contracts` **only**. That rule is what keeps domain logic out of the browser bundle.

Changing `.boundaries.json`, `ci.yml`, or `engineering-guardrails.md` requires an ADR in the same commit (G2, enforced). Never edit a rule to make a red build green.

## Notion, and keeping it current

Notion is the stakeholder-facing view: [Convert workspace](https://app.notion.com/p/3c14771f641e809abeb6ddf613dabc2d), specified in
`docs/notion-workspace.md`. Reached through the claude.ai connector over OAuth, which is per
client: run `/mcp` once per machine. Git owns how the
system works; Notion owns how the work is going. Never fork a document between the two:
mirror what stakeholders read and link the rest, naming the source commit.

Update it as part of the work, not as a separate chore:

- A pull request opens or merges: move the Backlog row, attach the PR, tick Definition of Done.
- A decision lands: record the outcome and date in Decisions, and write the ADR in git in the
  same sitting. A decided item with an Open row is how a project loses track of itself.
- A new external account or service: add a Resources row with owner and monthly cost.
- A secret added or rotated: add or update the Credentials register row. **The value goes to
  Infisical. Notion holds the reference only, never a token, connection string, or password.**
- A sprint starts or ends: new Sprints row with one goal; at close, answer Goal met honestly
  and fill in What we learned. Two-week cadence, one Active sprint at a time.
- Anything in the workspace changes by hand: add a Changelog row saying what and **why**, with
  the pull request. Machine rows are written by the mirror pusher and need no help.
- Weekly: refresh the status page. Four headings, shipped, next, blocked, needs a decision.
- **Weekly: reconcile git and Notion, deliberately.** Decided 2026-08-21, after a session where both
  drifted in one sitting. Two commands and one judgement:

```bash
python tools/check_notion_mirror.py                                      # has a git source moved?
infisical run --env=dev -- python tools/push_notion_mirror.py --verify   # has someone edited Notion?
```

  `--verify` is the only check that sees an edit made *in* Notion; G15 cannot. Then read the
  Decisions database and ask one question: **is anything marked Open that has already been decided
  in an ADR?** That is the drift that matters, because a stale Open row sends the next person to
  chase settled work. It has already happened once.

  Keep the reconciliation cheap by not creating work for it: **mirror what stakeholders read and
  link the rest.** Duplicating narrative prose into both places is what makes reconciliation
  expensive, and it is avoidable — a Notion page that summarises and links to `docs/` never drifts.

**Mirrored documents are machine-checked (ADR 0021).** `docs/notion-mirror.json` registers every
Notion page derived from these docs, and gate G15 fails the build when a mirrored source moves
without the mirror catching up. Do not hand-copy a diagram:

```bash
infisical run --env=dev -- python tools/push_notion_mirror.py   # publish git-owned diagrams
python tools/push_notion_mirror.py --accept                     # record a hand-updated page
```

Diagrams are `verbatim` and a machine owns them. Stakeholder prose is `editorial` and a machine
must never rewrite it: G15 names the page and a person decides whether it now needs to say
something different. Every diagram in `docs/` is mermaid for this reason, so keep it that way.

A stale stakeholder page is worse than no page, because it gets believed.

## Agent skills

### Issue tracker

The **Backlog** database in Notion, under Delivery. Notion is not a tracker the skills support
first-class, so the workflow is described in prose and every wayfinding operation is defined in
Notion terms: see `docs/agents/issue-tracker.md`. GitHub Issues was rejected because this
repository is public.

**Notion is private and this repository is not.** Named pilot businesses (P1), the written kill
criteria (P6), and margin figures live in Notion only, and never travel into a commit, an ADR, or a
pull request.

### Triage labels

Expressed through the Backlog's own `Status`, `Waiting on`, `Size` and `Owner` fields rather than a
parallel label vocabulary, so the stakeholder board and the agent's view cannot disagree. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: the workspace packages are layers of one domain, enforced by `.boundaries.json` and
G1. No `CONTEXT.md` yet, but its glossary is now decidable from ADR 0030–0040. See
`docs/agents/domain.md`.

### Planning a large effort

`/wayfinder` charts work too big for one session as a map of **decision** tickets, worked one at a
time until the route is clear. It plans; it does not build. Both `/wayfinder` and
`/setup-matt-pocock-skills` are `disable-model-invocation`, so an agent cannot start them — a human
types the slash command.

Worth knowing before reaching for it: after the 21 August session, ten of the fourteen
build-blocking decisions are settled, so the remaining fog is small — E2, E8, and the legal text of
L2 and L3. Turning settled rules into ordered, buildable tickets is `/to-tickets`, not wayfinder.

## Conventions

- Docs live in `docs/`, kebab-case filenames, `##` for top-level sections.
- Update the `Last updated` line when editing a doc.
- Secrets come from Infisical, never a file: `infisical run --env=dev -- <command>` (ADR 0020).
- Conventional Commits. **No agent or tool co-authorship trailers**, commits carry their human author only.
