# Convert. SME Leads Platform

Mobile-first sales & lead management platform for Ghanaian SMEs. Docs, directory skeleton, design tokens, and guardrails exist; the workspace is not scaffolded yet.

## Documents and precedence

1. **`docs/mvp-scope.md`**. Authoritative build scope. Wins on anything in scope.
2. **`docs/product-spec.md`**. Full product vision + commercial model, derived from `Convert_Pitch_Deck.pptx`. Reference for intent, not for scope. §12 holds open questions, §13 the deck-vs-scope divergences.
3. **`docs/pre-development-checklist.md`**. What must be obtained, decided, or proven before implementation starts. IDs (E0–E7, L1–L4, R1–R9, A1–A6, S1–S7, P1–P6) are stable; cite them. §10 is the decision log, record decisions there as they land.
4. **`docs/architecture.md`**. Target architecture. §3 the decided stack, §6 invariants I1–I12, §20 the decisions it still assumes, §21 how the rules are kept.
5. **`docs/adr/`**. 20 decision records. 0001 and 0015–0020 Accepted; rest Proposed. Cite by number. Never edit an accepted Decision, supersede it.
6. **`docs/engineering-guardrails.md`**. Layout, the dependency rule, CI gates G1–G14, conventions. With `docs/code-review-checklist.md`, `docs/definition-of-done.md`, `docs/test-strategy.md`.
7. **`docs/error-handling.md`**. Errors are first class (ADR 0018): one catalogue carrying status, retryability, and the sentence a person reads. Layers below the API throw without logging.
8. **`docs/design-system.md`**. Shadcn primitives, Convert token tiers, domain tokens for stage/channel/status/window, accessibility and performance rules (ADR 0016).
9. **`docs/notion-workspace.md`**. Stakeholder-facing Notion workspace: structure, the backlog and decisions databases, and which system owns which fact.
10. `C:\Users\SolomonAboagye\Downloads\Convert_Pitch_Deck.pptx`, original source. 12 slides.

Do not resolve a scope conflict yourself. If the two docs disagree on something not already in `product-spec.md` §13, add it there and flag it.

## Ground rules for docs

- Do not invent product facts. If neither doc answers it, add it to `product-spec.md` §12 Open Questions instead of filling the gap.
- Amounts are GHS. Keep the deck's figures exact (150/350/700 monthly; 1,500/3,500/7,000 annual; GHS 25/seat overage).
- Keep the two state machines distinct, Lead status (`New → Contacted → Qualified → Converted → Lost`) is not the Deal pipeline (`New → Contacted → Qualified → Proposal → Won/Lost`). The deck conflated them; the scope splits them.

## MVP boundary

In: auth, organizations, members/roles, contacts, leads, lead sources, one default pipeline, deals, activities, tasks/follow-up reminders, WhatsApp/SMS outbound, lightweight campaigns, in-app notifications, dashboard, search/filter. Responsive web.

Out: quotes, invoices, payments/billing, seat enforcement, AI scoring, multiple pipelines, native apps, integrations/API, cost-per-lead attribution, advanced RBAC. Full list in `mvp-scope.md` §20–21.

Two consequences worth remembering: the MVP ships **no billing**, so tier entitlements must not be hardcoded; and it ships **no cost-per-lead attribution**, so deck problem P2 ("marketing spend is a black box") is not solved by the MVP.

## Highest-risk unknown

WhatsApp integration depth. Meta test credentials, Meta Cloud API direct, third-party BSPs, click-to-chat, and the future internal production provider are materially different paths with different cost, compliance, and template rules. Demo work may use the fastest available test/sandbox/temporary provider path, but production WhatsApp readiness blocks real pilot/customer launch. Treat inbound WhatsApp lead capture as unconfirmed until the demo spike proves it; treat production inbound capture as unconfirmed until the production readiness spike proves it.

## Stack

Decided 2026-08-18 (S1, ADR 0001): **Next.js** web · **NestJS on the Fastify adapter** api · **NestJS standalone** worker · **PostgreSQL 16** with **Drizzle** (ADR 0017) · pnpm monorepo · Postgres-backed job queue (ADR 0010) · OpenAPI generated and committed from the first endpoint (S7, ADR 0015).

Not yet scaffolded, no `package.json` yet. The directory skeleton, boundary rules, and guardrails exist; the workspace scaffold is the next task.

Hard constraint: **web, api, and Postgres deploy to the same region.** Every render is web → api → db, so a split deployment costs two intercontinental round trips against a 2.5 s LCP budget. Rules out edge-only hosting.

## Messaging adapters

All WhatsApp/SMS integrations must go through the provider-neutral messaging adapter contract. Valid implementations include Meta test credentials for demo, a third-party BSP/provider, Meta Cloud API direct, and the future internal production provider. Do not leak provider-specific payloads or APIs into contacts, leads, campaigns, tasks, activities, or insights.

## Guardrails, run before claiming anything works

```bash
python tools/check_boundaries.py           # layer boundaries (G1). Run before every push.
python tools/check_boundaries.py --matrix   # allowed-dependency matrix
python tools/check_invariant_coverage.py    # every invariant I1–I12 has a test (G6)
python tools/check_contrast.py              # design token contrast, WCAG (G13)
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
- Weekly: refresh the status page. Four headings, shipped, next, blocked, needs a decision.
- Scope changed in git: re-mirror the affected Product page and update its synced-from commit.

A stale stakeholder page is worse than no page, because it gets believed.

## Conventions

- Docs live in `docs/`, kebab-case filenames, `##` for top-level sections.
- Update the `Last updated` line when editing a doc.
- Secrets come from Infisical, never a file: `infisical run --env=dev -- <command>` (ADR 0020).
- Conventional Commits. **No agent or tool co-authorship trailers**, commits carry their human author only.
