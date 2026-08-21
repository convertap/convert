# Convert. Pre-Development Checklist

What must be settled before Phase 4 implementation starts. Two of these buckets are **calendar-bound, not effort-bound**, they consume real-world waiting time regardless of how fast the team works, so they start on day one and run in parallel with everything else.

Scope authority remains [`mvp-scope.md`](./mvp-scope.md). This document does not change scope; it lists what has to be decided, obtained, or proven first.

**Last updated:** 2026-08-21

## Status legend

| Mark | Meaning |
|------|---------|
| ☐ | Not started |
| ◐ | In progress |
| ☑ | Done |
| ⛔ | Blocks the relevant track, demo implementation, production pilot launch, or a specific code path cannot responsibly proceed until resolved |
| ⏱ | Calendar-bound, an external party controls the timeline |

---

## 1. External access with lead time

Start immediately. These gate the launch date more than the build does.

The demo path is separate from the production path. The product can be demonstrated with Meta test credentials or a third-party sandbox/production-ready BSP account, as long as Convert talks to it through the messaging adapter contract. Production Meta Business verification, a production WhatsApp Business Account, and production message templates still block a real pilot/customer launch.

| ID | Item | Flags | Owner | Status |
|----|------|-------|-------|--------|
| E0 | Demo WhatsApp provider. **Decided 2026-08-21:** the demo splits — WhatsApp inbound is proven against **Meta test credentials**, because that is the production path and a spike should exercise the path it proves. Fabric's own test environment covers SMS and sign-in codes, free to us. ADR 0036 | ⛔ | | ☑ |
| E1 | Meta Business verification for the Ghana entity | ⏱ | | ☐ |
| E2 | Production WhatsApp Business Account + dedicated phone number | ⛔ ⏱ | | ☐ |
| E3 | Production provider path. **Decided 2026-08-21: Meta Cloud API direct** for WhatsApp; Fabric keeps SMS and sign-in codes. One Meta app and one verification serve both WhatsApp and lead ads. Consequence: E1, E2 and E4 are Convert's to wait out and do not move to Fabric. Benefit: login depends on no Meta approval. ADR 0036 | ⛔ | | ☑ |
| E4 | Display-name approval, then first message templates approved | ⏱ | | ☐ |
| E5 | SMS aggregator selected; sender ID registered | ⏱ | | ☐ |
| E6 | Meta Lead Ads. **Decided 2026-08-21: in**, against the engineering recommendation. Meta app review for `leads_retrieval` starts alongside E1 and shares its verification. Assume a rejected first submission. ADR 0037 | ⛔ ⏱ | | ☑ |
| E7 | Infrastructure accounts: domain, hosting, repo, CI, error tracking | | | ☐ |

### E0. Demo WhatsApp access

For demo development, use the fastest provider path that can prove the workflow:

- Meta Cloud API test number.
- A BSP sandbox.
- A temporary third-party production-ready WhatsApp API account.

This proves Convert's product flow and adapter contract. It does **not** prove production business verification, final template approval, production sending limits, or production economics.

All demo messaging code must depend on the provider-neutral adapter interface, not directly on Meta, Twilio, Infobip, 360dialog, Hubtel, Arkesel, Termii, or the future internal provider. The future internal production adapter should be swappable without changing CRM, campaign, task, or activity code.

### E1–E2. Production WhatsApp access

Meta Business verification needs the business registration certificate and proof of address for the Ghanaian entity. Days to weeks, and it is a prerequisite for everything else on WhatsApp.

The WhatsApp Business Account needs a phone number **not already registered on WhatsApp**. Reps' personal numbers and any number currently running the WhatsApp Business app are unusable without migrating them off first. Sourcing a clean number is its own errand, start it early.

### E3. Production provider path

See [§9 Glossary](#9-glossary) for what a BSP is.

- **Direct (Meta Cloud API)**. Own Meta app, own verification, Meta's per-conversation rate with no markup. Cheaper floor, more setup burden.
- **Via BSP / third-party provider**. Twilio, 360dialog, Infobip, Gupshup, or a local reseller. They handle onboarding, number provisioning, template submission UI, and often a unified WhatsApp + SMS API. You pay a markup per message or a platform fee.
- **Internal production adapter**. A personally built provider path can replace Meta/BSP later if it satisfies the same adapter contract and production compliance requirements.

**Recommendation:** use the fastest credible provider for the demo, then decide production path on cost, onboarding speed, support quality, Ghana SMS coverage, and ability to replace the adapter later. Do not let any provider-specific API leak into domain logic.

### E4. Three API rules that change the product, not just the integration

Each has a UI consequence:

1. **24-hour customer service window.** Free-form messages are permitted only within 24 hours of the customer's last inbound message. Outside it, only an approved template may be sent. "Launch a WhatsApp conversation from the contact record" (`mvp-scope.md` §12) therefore behaves differently depending on window state. The UI must show reps which mode they are in, or they will write messages that silently fail to send.
2. **Marketing templates require prior opt-in and per-template approval,** and message quality rating can throttle the number. Opt-in is a schema field with a timestamp and a source, not a checkbox.
3. **Per-number tiered sending limits** that scale with quality history. Campaign sends must queue and pace, never blast.

Verify current limits, category definitions, and pricing directly with Meta, published rates change, and per-conversation cost is what decides whether the 5,000/mo Pro tier has positive margin.

### E5. SMS

Sender ID registration runs through a Ghana aggregator (Hubtel, mNotify, Arkesel, Termii, or a telco bulk product) and needs NCA approval. Days. Confirm the provider exposes a **delivery-report webhook** before committing. `Mvp-scope.md` §13 requires delivery status.

**Added 2026-08-21: inbound SMS is now a requirement too, and it was not before.** ADR 0040 ships
`STOP` as a withdrawal route, which needs the provider to *receive* messages and parse a keyword —
a different capability from delivery reports. Fabric carries SMS (ADR 0036) and its support for
inbound reception is unverified. If it can only send, either the SMS withdrawal route changes or
the provider does. Confirm before telling anyone that `STOP` works.

### E6. Meta Lead Ads

The deck promises Facebook/Instagram lead ads (slide 6); `mvp-scope.md` §7 hedges it as "may be introduced depending on implementation complexity." Decide now. If it is in, Meta app review for the leadgen webhook permission is further lead time and must start alongside E1.

---

## 2. Legal and compliance

Cheapest before the pilot, expensive after. Pilot SMEs upload real customer phone numbers on day one.

| ID | Item | Flags | Owner | Status |
|----|------|-------|-------|--------|
| L1 | Register with Ghana's Data Protection Commission (Act 843) | ⏱ | | ☐ |
| L2 | Controller/processor terms in the pilot agreement. **Not calendar-bound** — a data-processing addendum is a standard clause set, days of work, waiting on nobody. It gates the first upload of real customer data, not commercial launch. **Sub-processors to disclose, as of 2026-08-21:** Meta (WhatsApp, lead ads), Fabric (SMS and sign-in codes), Cloudflare R2 (product images), Hubtel (customer payment data) | ⛔ | | ☐ |
| L3 | Marketing opt-in consent model, capture, storage, withdrawal. **Mechanism decided 2026-08-21 (ADR 0040):** an inbound WhatsApp message is not marketing consent; imported contacts arrive with none and campaigns to them are blocked; the exact wording shown is stored with the record; withdrawal has three entry points writing one append-only record. **Still open: the legal text**, which needs a lawyer | ⛔ | | ◐ |
| L4 | Data retention, export, and deletion policy | | | ☐ |

L2 blocks because pilot SMEs are the data controllers and Convert is the processor; that split has to be written down before their customer data lands in the system.

L3 blocks because it is simultaneously a legal requirement, a Meta requirement (E4.2), and a database column. It cannot be retrofitted onto contacts already collected.

---

## 3. Product rules that shape the schema

One decision session with the product owner, before any code. This is `mvp-scope.md` §22 made concrete. Ordered by cost-if-wrong.

| ID | Decision | Recommendation | Status |
|----|----------|----------------|--------|
| R1 | Phone number as contact identity, unique per workspace? merge or flag duplicates? | **Decided 2026-08-21:** Normalize to E.164 on write; unique per **workspace**; several numbers per contact, one primary, all matchable for inbound; merge prompt on collision; at least one of phone/email. ADR 0030 | ☑ |
| R2 | Lead ↔ Deal cardinality, and what creates a Deal | **Decided 2026-08-21:** A deal is an opportunity for **one product**, created by explicit rep action at Qualified. A lead has many deals, at most one open per product. ADR 0031 | ☑ |
| R3 | Can a rep see other reps' leads? | **Decided 2026-08-21:** Owner sees all; rep sees own **plus unassigned**; widening is a per-member `can_view_all_leads` grant. Reps claim unassigned leads without blocking approval. ADR 0032 | ☑ |
| R4 | Reassignment and offboarding: what happens to a deactivated rep's leads | **Decided 2026-08-21:** Deactivation reassigns to a named member **or** returns records to the unassigned queue. Never orphaned. ADR 0032 | ☑ |
| R5 | Money representation | **Decided 2026-08-21:** GHS only, integer pesewas, snapshotted onto deals and invoice lines. ADR 0033 | ☑ |
| R6 | Time and "overdue" semantics | **Decided 2026-08-21:** Store UTC, display Africa/Accra. Confirmed; the exact overdue instant is an implementation detail | ☑ |
| R7 | Mutability of history | **Decided 2026-08-21:** Activity log append-only, unchanged (I6) | ☑ |
| R8 | Final lead statuses vs. deal stages | **Decided 2026-08-21:** Two state machines stay distinct. Converted deal enters at `Qualified`; `Converted` needs at least one deal; lost reason optional; Lost terminal. ADR 0031 | ☑ |
| R9 | Public resource ID strategy | **Decided 2026-08-21:** ULID external IDs, unchanged (I12, ADR 0004) | ☑ |

R1 is first because WhatsApp identity **is** the phone number, dedupe, inbound message matching, and campaign targeting all resolve through it.

R3 is not a permissions feature. It decides whether every query is owner-scoped in the data access layer; retrofitting it later is a rewrite.

---

## 4. Authentication and tenancy

| ID | Decision | Notes | Status |
|----|----------|-------|--------|
| A1 | Login method | **Decided 2026-08-20:** identity accepts email *or* phone (at least one, each unique); passwordless, the credential is always a one-time code; delivered through a `VerificationPort` with Fabric behind it, over email or SMS (WhatsApp once E4 approves an authentication template). 15-minute access token in front of a stored, revocable, identity-only session; refresh rotates on every use and expires 7 days after creation. ADR 0029, ADR 0047 | ☑ |
| A2 | Does a user belong to one workspace, or many? | **Decided 2026-08-21:** A user belongs to **many** workspaces. ADR 0030 | ☑ |
| A3 | Invite acceptance channel | A1 settled the identifier: an invite is addressed to whichever identifier the owner enters, and accepted by the same one-time code flow. Remaining question is only the wording and expiry of an invite | ◐ |
| A4 | Tenancy model | **Decided 2026-08-21:** Workspace is the tenant; `organization` renamed to `workspace`; contacts copied, never shared. ADR 0030 | ☑ |
| A5 | Entitlement boundary | **Decided 2026-08-21:** Subscription per workspace; split fee platform default with per-workspace override, snapshotted per transaction. ADR 0034 | ☑ |
| A6 | Principal model | **Decided 2026-08-21:** Principal model confirmed, plus a fourth `PlatformAdminPrincipal` with audited, non-ambient cross-tenant access. ADR 0035 | ☑ |

---

## 5. Stack and non-functional targets

| ID | Item | Notes | Status |
|----|------|-------|--------|
| S1 | Stack selection | **Decided 2026-08-18:** Next.js web, NestJS on the Fastify adapter, one worker, one PostgreSQL, pnpm monorepo. ADR 0001. Hard constraint: web, api, and database in the same region, see `architecture.md` §3 | ☑ |
| S7 | OpenAPI from the first endpoint | **Decided 2026-08-18:** generated with `@nestjs/swagger`, committed as `apps/api/openapi.json`, drift fails CI gate G10. ADR 0015. **Source settled 2026-08-21:** the Zod schema in `contracts` is the single source and `nestjs-zod` derives the Nest DTO in `apps/api`. ADR 0045. Built so far: G10's completeness half and the `.boundaries.json` rule keeping Nest out of `contracts`. **Not built: the dependency itself, the DTO classes, the validation pipe and the cursor change** — the decision is made, the wiring is a separate commit | ☑ |
| S2 | Mobile performance budget as a number | **Decided 2026-08-18 (ADR 0012):** five numbers in `architecture.md` §18 — ≤ 150 KB gzipped initial JS on the pipeline screen, ≤ 2.5 s LCP, ≤ 200 ms INP, ≤ 300 ms p75 server response on list views, ≤ 500 KB first visit. Enforced as G9 via `lighthouserc.json`. **G9 is vacuous until `apps/web` is real** | ☑ |
| S3 | Background jobs and scheduler | **Decided across two records.** Queue 2026-08-18 (ADR 0010): Postgres-backed, no second stateful service; BullMQ on Redis rejected. Scheduler 2026-08-19 (ADR 0022): the worker is a Railway **cron service on a five-minute schedule**, draining a bounded batch and exiting, because Railway skips a run while the previous one is still going. Sweeps stay idempotent per (task, due-window) and timezone-sensitive (I11) | ☑ |
| S4 | Public webhook endpoint design | Signature-verified, idempotent, replay-safe. Providers retry; duplicates will arrive | ☐ |
| S5 | Event instrumentation | Activation is "10+ contacts and 1+ deal within 7 days" (`mvp-scope.md` §26). Unmeasurable if analytics is bolted on afterward | ☐ |
| S6 | Environments | **Decided 2026-08-19 (ADR 0022):** staging live on Railway in Amsterdam, api and web always-on beside Postgres 18, one region, private network, config-as-code in `apps/*/railway.json`. Worker deliberately not deployed until it has a handler and a drain-and-exit entrypoint. Point-in-time recovery available but off, and backups stay unproven until one is restored | ☑ |

---

## 6. Pilot readiness

Agree before the build, not after.

| ID | Item | Status |
|----|------|--------|
| P1 | Named pilot SMEs (3–5) matching the Growing SME Sales Team profile | ☐ |
| P2 | Signed pilot agreement including the L2 data terms | ☐ |
| P3 | Commercial basis for the pilot. Free, given no billing ships in the MVP | ☐ |
| P4 | Feedback cadence, and who runs the sessions | ☐ |
| P5 | Who imports each pilot business's existing contacts | ☐ |
| P6 | **Written kill criteria**. What result ends the project | ☐ |

P6 matters most. Without it agreed in advance, every pilot outcome gets read as success.

---

## 7. WhatsApp spike, do this before UX design

**Timebox: one to two days for the demo spike.** Run it before Phase 2 design commits to
screens.

The original estimate was a week, set when the provider was unknown and inbound delivery was an
open question. Fabric changes that: it is our own product, so whether a webhook arrives at all is
not something we need to discover. What is left is Convert-side code and one measurement, and
that is a day or two rather than a week.

**Be precise about what the spike still proves.** Fabric answers "can a message be received". It
does not answer "does an inbound message become a lead in Convert", because none of that code
exists: no webhook ingress, no phone-to-contact match, no idempotency on repeated callbacks. That
is the part worth proving before a dozen screens are designed on top of it.

**And it does not remove the Meta approval underneath.** If Fabric wraps Cloud API, Convert still
needs Meta Business verification, a dedicated number, and template approval (E1, E2, E4), and
those are calendar-bound waiting rather than engineering time. If Fabric holds its own Solution
Provider status, they move to Fabric and leave Convert's critical path. That single question is
worth answering before planning around either. It is recorded on E3.

Run this in two stages:

1. **Demo spike:** use Meta test credentials, a BSP sandbox, or a temporary third-party production-ready account.
2. **Production readiness spike:** repeat the same checks with the chosen production provider before any real pilot/customer launch.

Prove exactly three things, nothing else:

1. Send an approved template message to a real Ghanaian number.
2. Receive an inbound customer message via webhook and match it to a contact by phone number.
3. Read a delivery status callback and persist it.

**Why it comes first.** `mvp-scope.md` hedges WhatsApp three separate times. "Where integration allows" (§7), "where supported" (§12), "may be considered" (§12). That hedge is currently load-bearing on the deck's single strongest claim. If inbound capture does not work, MVP lead capture collapses to manual entry plus web form, and roughly a dozen screens would have been designed around a flow that does not exist.

**Demo exit criteria:** a written answer to "can the demo prove inbound WhatsApp lead capture through the adapter, yes or no." Record provider limitations separately from product limitations.

**Production exit criteria:** a written answer to "does inbound WhatsApp lead capture ship in the production MVP, yes or no," plus the measured per-conversation cost. Both feed straight back into `product-spec.md` §12.

Spike code is throwaway. Do not let it become the integration.

---

## 8. Sequencing

Three tracks run concurrently. Only the third produces code.

**Track A. Paperwork** (starts day 1, mostly waiting)
E1 → E2 → E4 · E5 · E6 · L1

**Track B, decisions** (weeks 1–2, mostly meetings)
R1–R9 in one session → A1–A6 → L2–L4 → P1–P6 · S1 and S7 are decided (ADR 0001, ADR 0015)

**Track C, proving** (week 1, throwaway code, one to two days of it)
E0 → demo WhatsApp spike (§7) → E3 production provider decision → production readiness spike → answer recorded in `product-spec.md` §12

Track C used to sit in weeks 2–3 because it waited on choosing a provider. With Fabric as the
intended path the demo spike can start in week 1, which matters: it is the cheapest way to find
out early whether inbound capture holds up.

Demo implementation can start once E0, S1, and the core product rules needed for the affected screens are documented. Production pilot launch waits for Track A and the production readiness spike. Messaging code must go through the adapter contract from the first implementation, or provider swaps become rewrites.

---

## 9. Glossary

**BSP, Business Solution Provider.** A Meta-authorized WhatsApp Business Platform partner you buy API access through instead of going direct to Meta. Meta has been rebranding these as Solution Partners / Tech Providers, but BSP remains the common term. Examples: Twilio, 360dialog, Infobip, MessageBird, Gupshup; in Ghana, Hubtel, Arkesel, and Termii resell alongside their SMS products.

**Cloud API.** Meta-hosted WhatsApp Business Platform API. The direct path, no BSP and no markup, but you own verification and integration.

**Messaging adapter.** Convert's provider-neutral interface for sending WhatsApp/SMS messages and processing provider webhooks. Meta test credentials, BSPs, and the future internal production provider are implementations of this interface, not dependencies of the CRM domain.

**24-hour window.** The period after a customer's inbound message during which a business may send free-form replies. Outside it, only pre-approved templates.

**Template.** A pre-approved message body, submitted per use case and category (marketing, utility, authentication, service). Marketing templates require prior opt-in and are priced and throttled differently.

**Sender ID.** The alphanumeric name a bulk SMS appears to come from. Requires NCA registration through an aggregator in Ghana.

**E.164.** International phone number format, `+233XXXXXXXXX`. The normalization target for R1.

**DPC.** Ghana's Data Protection Commission, the regulator under the Data Protection Act 2012 (Act 843).

**NCA.** National Communications Authority, the Ghanaian telecoms regulator that approves SMS sender IDs.

---

## 10. Decision log

Fill in as decisions land. Record the decision, not the discussion.

| Date | ID | Decision | Decided by |
|------|----|----------|------------|
| 2026-08-18 | S1 | Next.js web, NestJS on Fastify api, one worker, one PostgreSQL, pnpm monorepo. ADR 0001 | Engineering |
| 2026-08-18 | S7 | OpenAPI generated with `@nestjs/swagger`, committed, drift fails G10. ADR 0015 | Engineering |
| 2026-08-20 | A1 | Email *or* phone as identifier; passwordless one-time code as the only credential; Fabric behind a `VerificationPort`. ADR 0029 | Product owner |
| 2026-08-21 | R1, A2, A4 | Workspace is the tenant; `workspace` renamed; a user joins many workspaces; contacts copied; contact identity and multi-number inbound matching. ADR 0030 | Product owner |
| 2026-08-21 | R2, R8 | A deal is a per-product opportunity; a lead has many; a converted lead's deal enters at `Qualified`; lost reason optional; Lost terminal. ADR 0031 | Product owner |
| 2026-08-21 | R3, R4 | Rep sees own plus unassigned; per-member visibility grant; non-blocking claim; deactivation may park records in the queue. ADR 0032 | Product owner |
| 2026-08-21 | scope | Commerce enters the MVP: products, media library, invoices, composable tax. `product-spec.md` §13 amendment A. ADR 0033 | Product owner |
| 2026-08-21 | A5 | Payment collection into the SME's own MoMo account, optional per workspace; Convert never holds funds; manual recording is the baseline. ADR 0034 | Product owner |
| 2026-08-21 | A6 | `PlatformAdminPrincipal` crosses tenancy only by an audited action; `apps/admin` deferred. ADR 0035 | Product owner |
| 2026-08-21 | E0, E3 | WhatsApp direct to Meta Cloud API; Fabric carries SMS and sign-in codes, so login depends on no Meta approval. ADR 0036 | Product owner |
| 2026-08-21 | E6 | Facebook and Instagram lead ads are in scope, against the engineering recommendation, with Meta app review named as the cost. ADR 0037 | Product owner |
| 2026-08-21 | S8, S9 | Cloudflare R2 for media; envelope-encrypted per-workspace credentials with the master key outside Postgres. ADR 0038 | Engineering |
| 2026-08-21 | E9, E8 | Hubtel for payments. Invoicing in two stages: serve non-VAT-registered businesses now, pursue GRA certification as a funded workstream. ADR 0039 | Product owner |
| 2026-08-21 | L3 | Consent operating rules: an inbound message is not marketing consent, imports create none, the wording shown is stored, withdrawal has three entry points and one record. Legal text still outstanding. ADR 0040 | Product owner |
| 2026-08-21 | S7 | Zod schemas in `contracts` are the single source for OpenAPI; `nestjs-zod` derives the DTO class in `apps/api`; requests validated globally and field errors reach the envelope; cursor is the ULID; G10's completeness half built. ADR 0045 | Engineering |
| 2026-08-18 | S2 | Mobile performance budget is five numbers in `architecture.md` §18, enforced as G9 through `lighthouserc.json`. ADR 0012. *Logged 21 August; the decision predates the row* | Engineering |
| 2026-08-19 | S3 | Job queue is Postgres-backed (ADR 0010); the worker is a Railway cron service on a five-minute schedule that drains a bounded batch and exits (ADR 0022). Always-on worker and folding it into the api both rejected. *Logged 21 August* | Engineering |
| 2026-08-19 | S6 | Staging on Railway in Amsterdam, one region with Postgres 18, config-as-code. Worker not deployed until it has a handler. ADR 0022. *Logged 21 August* | Engineering |
| 2026-08-21 | A1 | Refresh tokens are stored: one revocable `session` row per family, identity-only, generation-numbered so replay revokes the family. Rate limits are a Postgres table, not memory. **Lifetime shortened from 30 days to 7**, at roughly 4.3× the verification spend ADR 0029 budgeted. ADR 0047 | Product owner |

**New blocking items created by the 21 August session**, none of which existed before it:

| ID | Item | Flags | Status |
|----|------|-------|--------|
| E8 | GRA Certified Invoicing System certification. **Approach decided 2026-08-21 (ADR 0039):** stage one serves businesses that are not VAT-registered; stage two pursues certification through Joint UAT with the GRA, about four weeks against the VSDC API. Still blocks any VAT-labelled document. E-VAT has been mandatory since January 2026, and issuing without pre-issue clearance carries criminal penalties for the SME | ⛔ ⏱ | ☐ |
| E9 | Payment provider. **Decided 2026-08-21: Hubtel** — all three MoMo networks, and it settles to a wallet rather than only a bank, which is what keeps unbanked SMEs in. The fee comparison against MTN direct was **not** completed and remains outstanding. ADR 0039 | | ◐ |
| S8 | Object storage provider and region for the media library, matching the same-region constraint, with upload limits and resized derivatives | **Decided 2026-08-21:** **Cloudflare R2**, S3-compatible, zero egress, global edge. Images bypass the render path so they are not pinned to the deploy region. Derivatives at upload; only the primary loads in list views. ADR 0038 | ☑ |
| S9 | Encrypted per-workspace merchant-credential storage with its own key management. Infisical is the wrong tool for tenant-owned keys (ADR 0020) | **Decided 2026-08-21:** **Envelope encryption**: per-workspace AES-256-GCM data key wrapped by a master key in Infisical, never in Postgres. Write-only, never logged, never returned. ADR 0038 | ☑ |

**That backlog is cleared, 21 August 2026.** S2, S3 and S6 each had a decision recorded in an ADR or
running in CI that never reached this table, and their status columns said the opposite. All three
are now logged above and closed in the Decisions database in the same sitting.

S3 is the one worth a note. Read against ADR 0010 alone it looks half decided — 0010 settles the
queue substrate and names no scheduler. The scheduler is in **ADR 0022**, which specifies the worker
as a Railway cron service, because the decision arrived as part of choosing the hosting rather than
as part of choosing the queue. A checklist ID whose answer is split across two records is exactly
the kind of item that reads as open forever, and the fix is to cite both.
