# Convert — SME Leads Platform

Mobile-first sales & lead management platform for Ghanaian SMEs. Pre-code: only docs exist so far.

## Documents and precedence

1. **`docs/mvp-scope.md`** — authoritative build scope. Wins on anything in scope.
2. **`docs/product-spec.md`** — full product vision + commercial model, derived from `Convert_Pitch_Deck.pptx`. Reference for intent, not for scope. §12 holds open questions, §13 the deck-vs-scope divergences.
3. **`docs/pre-development-checklist.md`** — what must be obtained, decided, or proven before implementation starts. IDs (E0–E7, L1–L4, R1–R9, A1–A6, S1–S6, P1–P6) are stable; cite them. §10 is the decision log — record decisions there as they land.
4. **`docs/architecture.md`** — target architecture. Stack-agnostic; §3 holds the stack slot, §20 lists the decisions it assumes, §21 the ADR index. Cite ADR numbers (001–012) even before the ADRs are written.
5. `C:\Users\SolomonAboagye\Downloads\Convert_Pitch_Deck.pptx` — original source. 12 slides.

Do not resolve a scope conflict yourself. If the two docs disagree on something not already in `product-spec.md` §13, add it there and flag it.

## Ground rules for docs

- Do not invent product facts. If neither doc answers it, add it to `product-spec.md` §12 Open Questions instead of filling the gap.
- Amounts are GHS. Keep the deck's figures exact (150/350/700 monthly; 1,500/3,500/7,000 annual; GHS 25/seat overage).
- Keep the two state machines distinct — Lead status (`New → Contacted → Qualified → Converted → Lost`) is not the Deal pipeline (`New → Contacted → Qualified → Proposal → Won/Lost`). The deck conflated them; the scope splits them.

## MVP boundary

In: auth, organizations, members/roles, contacts, leads, lead sources, one default pipeline, deals, activities, tasks/follow-up reminders, WhatsApp/SMS outbound, lightweight campaigns, in-app notifications, dashboard, search/filter. Responsive web.

Out: quotes, invoices, payments/billing, seat enforcement, AI scoring, multiple pipelines, native apps, integrations/API, cost-per-lead attribution, advanced RBAC. Full list in `mvp-scope.md` §20–21.

Two consequences worth remembering: the MVP ships **no billing**, so tier entitlements must not be hardcoded; and it ships **no cost-per-lead attribution**, so deck problem P2 ("marketing spend is a black box") is not solved by the MVP.

## Highest-risk unknown

WhatsApp integration depth. Meta test credentials, Meta Cloud API direct, third-party BSPs, click-to-chat, and the future internal production provider are materially different paths with different cost, compliance, and template rules. Demo work may use the fastest available test/sandbox/temporary provider path, but production WhatsApp readiness blocks real pilot/customer launch. Treat inbound WhatsApp lead capture as unconfirmed until the demo spike proves it; treat production inbound capture as unconfirmed until the production readiness spike proves it.

## Stack

Not yet chosen (checklist S1). `architecture.md` §3 holds the slot and a recommendation — one codebase with web/API process + worker process on Postgres — but do not assume a framework, ORM, or host until S1 is decided. This is not a separate backend service/repo architecture. Everything else in `architecture.md` is stack-independent and can be cited now.

## Messaging adapters

All WhatsApp/SMS integrations must go through the provider-neutral messaging adapter contract. Valid implementations include Meta test credentials for demo, a third-party BSP/provider, Meta Cloud API direct, and the future internal production provider. Do not leak provider-specific payloads or APIs into contacts, leads, campaigns, tasks, activities, or insights.

## Conventions

- Docs live in `docs/`, kebab-case filenames, `##` for top-level sections.
- Update the `Last updated` line when editing a doc.
