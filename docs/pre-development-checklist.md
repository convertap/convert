# Convert — Pre-Development Checklist

What must be settled before Phase 4 implementation starts. Two of these buckets are **calendar-bound, not effort-bound** — they consume real-world waiting time regardless of how fast the team works, so they start on day one and run in parallel with everything else.

Scope authority remains [`mvp-scope.md`](./mvp-scope.md). This document does not change scope; it lists what has to be decided, obtained, or proven first.

**Last updated:** 2026-08-18

## Status legend

| Mark | Meaning |
|------|---------|
| ☐ | Not started |
| ◐ | In progress |
| ☑ | Done |
| ⛔ | Blocks the relevant track — demo implementation, production pilot launch, or a specific code path cannot responsibly proceed until resolved |
| ⏱ | Calendar-bound — an external party controls the timeline |

---

## 1. External access with lead time

Start immediately. These gate the launch date more than the build does.

The demo path is separate from the production path. The product can be demonstrated with Meta test credentials or a third-party sandbox/production-ready BSP account, as long as Convert talks to it through the messaging adapter contract. Production Meta Business verification, a production WhatsApp Business Account, and production message templates still block a real pilot/customer launch.

| ID | Item | Flags | Owner | Status |
|----|------|-------|-------|--------|
| E0 | Demo WhatsApp provider selected and configured: Meta test account, BSP sandbox, or temporary third-party production-ready account | ⛔ | | ☐ |
| E1 | Meta Business verification for the Ghana entity | ⏱ | | ☐ |
| E2 | Production WhatsApp Business Account + dedicated phone number | ⛔ ⏱ | | ☐ |
| E3 | Decide production provider path: Meta Cloud API direct, third-party BSP, or internal production adapter | ⛔ | | ☐ |
| E4 | Display-name approval, then first message templates approved | ⏱ | | ☐ |
| E5 | SMS aggregator selected; sender ID registered | ⏱ | | ☐ |
| E6 | Meta Lead Ads: in or out of MVP (if in, app review for the leadgen webhook) | ⛔ ⏱ | | ☐ |
| E7 | Infrastructure accounts: domain, hosting, repo, CI, error tracking | | | ☐ |

### E0 — Demo WhatsApp access

For demo development, use the fastest provider path that can prove the workflow:

- Meta Cloud API test number.
- A BSP sandbox.
- A temporary third-party production-ready WhatsApp API account.

This proves Convert's product flow and adapter contract. It does **not** prove production business verification, final template approval, production sending limits, or production economics.

All demo messaging code must depend on the provider-neutral adapter interface, not directly on Meta, Twilio, Infobip, 360dialog, Hubtel, Arkesel, Termii, or the future internal provider. The future internal production adapter should be swappable without changing CRM, campaign, task, or activity code.

### E1–E2 — Production WhatsApp access

Meta Business verification needs the business registration certificate and proof of address for the Ghanaian entity. Days to weeks, and it is a prerequisite for everything else on WhatsApp.

The WhatsApp Business Account needs a phone number **not already registered on WhatsApp**. Reps' personal numbers and any number currently running the WhatsApp Business app are unusable without migrating them off first. Sourcing a clean number is its own errand — start it early.

### E3 — Production provider path

See [§9 Glossary](#9-glossary) for what a BSP is.

- **Direct (Meta Cloud API)** — own Meta app, own verification, Meta's per-conversation rate with no markup. Cheaper floor, more setup burden.
- **Via BSP / third-party provider** — Twilio, 360dialog, Infobip, Gupshup, or a local reseller. They handle onboarding, number provisioning, template submission UI, and often a unified WhatsApp + SMS API. You pay a markup per message or a platform fee.
- **Internal production adapter** — a personally built provider path can replace Meta/BSP later if it satisfies the same adapter contract and production compliance requirements.

**Recommendation:** use the fastest credible provider for the demo, then decide production path on cost, onboarding speed, support quality, Ghana SMS coverage, and ability to replace the adapter later. Do not let any provider-specific API leak into domain logic.

### E4 — Three API rules that change the product, not just the integration

Each has a UI consequence:

1. **24-hour customer service window.** Free-form messages are permitted only within 24 hours of the customer's last inbound message. Outside it, only an approved template may be sent. "Launch a WhatsApp conversation from the contact record" (`mvp-scope.md` §12) therefore behaves differently depending on window state — the UI must show reps which mode they are in, or they will write messages that silently fail to send.
2. **Marketing templates require prior opt-in and per-template approval,** and message quality rating can throttle the number. Opt-in is a schema field with a timestamp and a source, not a checkbox.
3. **Per-number tiered sending limits** that scale with quality history. Campaign sends must queue and pace, never blast.

Verify current limits, category definitions, and pricing directly with Meta — published rates change, and per-conversation cost is what decides whether the 5,000/mo Pro tier has positive margin.

### E5 — SMS

Sender ID registration runs through a Ghana aggregator (Hubtel, mNotify, Arkesel, Termii, or a telco bulk product) and needs NCA approval. Days. Confirm the provider exposes a **delivery-report webhook** before committing — `mvp-scope.md` §13 requires delivery status.

### E6 — Meta Lead Ads

The deck promises Facebook/Instagram lead ads (slide 6); `mvp-scope.md` §7 hedges it as "may be introduced depending on implementation complexity." Decide now — if it is in, Meta app review for the leadgen webhook permission is further lead time and must start alongside E1.

---

## 2. Legal and compliance

Cheapest before the pilot, expensive after. Pilot SMEs upload real customer phone numbers on day one.

| ID | Item | Flags | Owner | Status |
|----|------|-------|-------|--------|
| L1 | Register with Ghana's Data Protection Commission (Act 843) | ⏱ | | ☐ |
| L2 | Controller/processor terms in the pilot agreement | ⛔ | | ☐ |
| L3 | Marketing opt-in consent model — capture, storage, withdrawal | ⛔ | | ☐ |
| L4 | Data retention, export, and deletion policy | | | ☐ |

L2 blocks because pilot SMEs are the data controllers and Convert is the processor; that split has to be written down before their customer data lands in the system.

L3 blocks because it is simultaneously a legal requirement, a Meta requirement (E4.2), and a database column — it cannot be retrofitted onto contacts already collected.

---

## 3. Product rules that shape the schema

One decision session with the product owner, before any code. This is `mvp-scope.md` §22 made concrete. Ordered by cost-if-wrong.

| ID | Decision | Recommendation | Status |
|----|----------|----------------|--------|
| R1 | Phone number as contact identity — unique per org? merge or flag duplicates? | Normalize to E.164 `+233…` on write; unique per organization; surface a merge prompt rather than silently rejecting | ☐ |
| R2 | Lead ↔ Deal cardinality, and what creates a Deal | Contact → many Leads; Lead → at most one Deal; Deal created explicitly at Qualified, not automatically | ☐ |
| R3 | Can a rep see other reps' leads? | Owner sees all; rep sees own by default, with an org-level toggle. Decide now — this scopes every query at the data layer | ☐ |
| R4 | Reassignment and offboarding: what happens to a deactivated rep's leads | Bulk reassign required in MVP; deactivation must never orphan records | ☐ |
| R5 | Money representation | GHS only, integer pesewas, never floating point. Deal value nullable | ☐ |
| R6 | Time and "overdue" semantics | Store UTC, display Africa/Accra (UTC+0, no DST). Define the exact instant a follow-up becomes overdue | ☐ |
| R7 | Mutability of history | Activity log append-only. No hard deletes, no edits — the log *is* the P3 promise | ☐ |
| R8 | Final lead statuses vs. deal stages | Keep the two state machines separate. Confirm which stage a converted Lead's Deal enters, and that a Lead may exist with no Deal | ☐ |
| R9 | Public resource ID strategy | ULID (sortable, opaque) as the external ID on every entity. Auto-increment integers cannot be exposed through the Pro-tier public API and leak row counts | ☐ |

R1 is first because WhatsApp identity **is** the phone number — dedupe, inbound message matching, and campaign targeting all resolve through it.

R3 is not a permissions feature. It decides whether every query is owner-scoped in the data access layer; retrofitting it later is a rewrite.

---

## 4. Authentication and tenancy

| ID | Decision | Notes | Status |
|----|----------|-------|--------|
| A1 | Login method | Reps are phone-first and many have no working email. Options: email + password, phone + OTP (costs SMS per login), or magic link over WhatsApp/SMS | ☐ |
| A2 | Does a user belong to one organization, or many? | Determines the invite flow and the identity model | ☐ |
| A3 | Invite acceptance channel | If A1 is not email, invites cannot be email-only | ☐ |
| A4 | Tenancy model | Single database, `org_id` on every row, enforced at the query layer. Do not use schema-per-tenant at this size | ☐ |
| A5 | Entitlement boundary | MVP ships no billing, but tier caps (contacts, seats, messages) must not be hardcoded — leave a layer that can enforce them later. Pro-tier API access is the first thing this must gate | ☐ |
| A6 | Principal model | Model the actor as a principal (user session **or** API client) from day one. The deck sells a Pro-tier public API (slide 6, Phase 3) — if endpoints assume a session, adding clients later touches every route | ☐ |

---

## 5. Stack and non-functional targets

| ID | Item | Notes | Status |
|----|------|-------|--------|
| S1 | Stack selection | Choose on team skill, not novelty — whoever builds it maintains it | ☐ |
| S2 | Mobile performance budget as a number | JS bundle ceiling and LCP target on throttled 4G, enforced in CI. Mobile-first is the entire differentiation claim (deck slide 7) | ☐ |
| S3 | Background jobs and scheduler | Required in Phase 1, not later: campaign sends, follow-up reminders, delivery webhooks | ☐ |
| S4 | Public webhook endpoint design | Signature-verified, idempotent, replay-safe. Providers retry; duplicates will arrive | ☐ |
| S5 | Event instrumentation | Activation is "10+ contacts and 1+ deal within 7 days" (`mvp-scope.md` §26). Unmeasurable if analytics is bolted on afterward | ☐ |
| S6 | Environments | Local, staging, production; seed data for demos | ☐ |

---

## 6. Pilot readiness

Agree before the build, not after.

| ID | Item | Status |
|----|------|--------|
| P1 | Named pilot SMEs (3–5) matching the Growing SME Sales Team profile | ☐ |
| P2 | Signed pilot agreement including the L2 data terms | ☐ |
| P3 | Commercial basis for the pilot — free, given no billing ships in the MVP | ☐ |
| P4 | Feedback cadence, and who runs the sessions | ☐ |
| P5 | Who imports each pilot business's existing contacts | ☐ |
| P6 | **Written kill criteria** — what result ends the project | ☐ |

P6 matters most. Without it agreed in advance, every pilot outcome gets read as success.

---

## 7. WhatsApp spike — do this before UX design

**Timebox: one week.** Run it before Phase 2 design commits to screens.

Run this in two stages:

1. **Demo spike:** use Meta test credentials, a BSP sandbox, or a temporary third-party production-ready account.
2. **Production readiness spike:** repeat the same checks with the chosen production provider before any real pilot/customer launch.

Prove exactly three things, nothing else:

1. Send an approved template message to a real Ghanaian number.
2. Receive an inbound customer message via webhook and match it to a contact by phone number.
3. Read a delivery status callback and persist it.

**Why it comes first.** `mvp-scope.md` hedges WhatsApp three separate times — "where integration allows" (§7), "where supported" (§12), "may be considered" (§12). That hedge is currently load-bearing on the deck's single strongest claim. If inbound capture does not work, MVP lead capture collapses to manual entry plus web form, and roughly a dozen screens would have been designed around a flow that does not exist.

**Demo exit criteria:** a written answer to "can the demo prove inbound WhatsApp lead capture through the adapter — yes or no." Record provider limitations separately from product limitations.

**Production exit criteria:** a written answer to "does inbound WhatsApp lead capture ship in the production MVP — yes or no," plus the measured per-conversation cost. Both feed straight back into `product-spec.md` §12.

Spike code is throwaway. Do not let it become the integration.

---

## 8. Sequencing

Three tracks run concurrently. Only the third produces code.

**Track A — paperwork** (starts day 1, mostly waiting)
E1 → E2 → E4 · E5 · E6 · L1

**Track B — decisions** (weeks 1–2, mostly meetings)
R1–R8 in one session → A1–A5 → S1 → L2–L4 → P1–P6

**Track C — proving** (weeks 2–3, throwaway code)
E0 → demo WhatsApp spike (§7) → E3 production provider decision → production readiness spike → answer recorded in `product-spec.md` §12

Demo implementation can start once E0, S1, and the core product rules needed for the affected screens are documented. Production pilot launch waits for Track A and the production readiness spike. Messaging code must go through the adapter contract from the first implementation, or provider swaps become rewrites.

---

## 9. Glossary

**BSP — Business Solution Provider.** A Meta-authorized WhatsApp Business Platform partner you buy API access through instead of going direct to Meta. Meta has been rebranding these as Solution Partners / Tech Providers, but BSP remains the common term. Examples: Twilio, 360dialog, Infobip, MessageBird, Gupshup; in Ghana, Hubtel, Arkesel, and Termii resell alongside their SMS products.

**Cloud API.** Meta-hosted WhatsApp Business Platform API. The direct path — no BSP and no markup, but you own verification and integration.

**Messaging adapter.** Convert's provider-neutral interface for sending WhatsApp/SMS messages and processing provider webhooks. Meta test credentials, BSPs, and the future internal production provider are implementations of this interface, not dependencies of the CRM domain.

**24-hour window.** The period after a customer's inbound message during which a business may send free-form replies. Outside it, only pre-approved templates.

**Template.** A pre-approved message body, submitted per use case and category (marketing, utility, authentication, service). Marketing templates require prior opt-in and are priced and throttled differently.

**Sender ID.** The alphanumeric name a bulk SMS appears to come from. Requires NCA registration through an aggregator in Ghana.

**E.164.** International phone number format — `+233XXXXXXXXX`. The normalization target for R1.

**DPC.** Ghana's Data Protection Commission, the regulator under the Data Protection Act 2012 (Act 843).

**NCA.** National Communications Authority — the Ghanaian telecoms regulator that approves SMS sender IDs.

---

## 10. Decision log

Fill in as decisions land. Record the decision, not the discussion.

| Date | ID | Decision | Decided by |
|------|----|----------|------------|
| | | | |
