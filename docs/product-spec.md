# Convert. Product Specification

**Tagline:** From lead to sale, in one place.

**One-liner:** A subscription-based, mobile-first marketing and sales platform that helps small and growing Ghanaian businesses generate leads, run campaigns, and close sales from a single shared system.

**Status:** Product concept. Source of truth for this document is `Convert_Pitch_Deck.pptx` (12 slides). Everything below is derived from that deck; items the deck does not answer are collected in [Open Questions](#12-open-questions) rather than invented.

**Precedence:** For anything in build scope, [`mvp-scope.md`](./mvp-scope.md) overrides this document. This file records the full product vision and commercial model as pitched; `mvp-scope.md` records what is actually being built first. Divergences are catalogued in [§13](#13-deck-vs-mvp-scope-reconciliation).

**Last updated:** 2026-08-21

---

## 1. Problem

SME selling in Ghana is effective but fragmented. Four distinct failures:

| # | Problem | Detail |
|---|---------|--------|
| P1 | Leads fall through the cracks | Leads arrive via WhatsApp, Instagram DMs, Facebook ads, and walk-ins with nothing tying them together. Follow-ups get missed and deals go cold. |
| P2 | Marketing spend is a black box | Owners cannot tell which channel (Facebook ads, flyers, radio, referrals) actually produces paying customers. |
| P3 | The business lives in one phone | Sales activity sits in an individual rep's phone. When that rep is busy, sick, or leaves, the relationship history leaves with them. |
| P4 | Existing CRMs don't fit | US/EU tools are email-first, card-payment-first, and priced in USD, a poor fit for cash-and-mobile-money, WhatsApp-first SME selling. |

### Design constraints implied by the problem

These are non-negotiable product constraints, not preferences:

1. **WhatsApp-first communication**. The primary channel, not an integration bolted on the side.
2. **Mobile connectivity**. Reps work from phones on variable networks.
3. **Cash and mobile-money payments**. Both for customer transactions and for the Convert subscription itself.
4. **Small teams wearing multiple hats**. The same person markets, sells, and invoices; the UI cannot assume role specialization.

---

## 2. Solution

One shared system that replaces the notebook and the group chat. A whole team works from the same pipeline instead of from individual phones.

### What replaces what

| Today | With Convert |
|-------|--------------|
| Scattered WhatsApp chats | Unified lead inbox |
| Paper notebooks | Visual sales pipeline |
| Personal spreadsheets | Shared team dashboard |
| Guesswork on ad spend | Source-by-source ROI |

---

## 3. Core Loop (How It Works)

Five steps forming one continuous loop. Each step maps to a product surface.

| Step | Name | Behaviour |
|------|------|-----------|
| 1 | **Capture** | A lead messages on WhatsApp, submits a web form, or clicks a Facebook/Instagram ad. Convert logs the lead automatically, tagged with its source. |
| 2 | **Organize** | Every lead lands in a visual kanban pipeline so the whole team can see the stage of each deal. |
| 3 | **Engage** | Reps get follow-up reminders. Owners send bulk WhatsApp/SMS campaigns to segments (e.g. "leads gone quiet in 7 days"). |
| 4 | **Close** | Quotes and invoices are generated from the deal record and sent to the customer. Payment status is tracked. |
| 5 | **Learn** | Dashboards show which marketing source produced the most paying customers, so spend shifts toward what works. |

Step 5 feeds step 1: attribution data changes where the next leads come from. Source tagging at capture is therefore load-bearing for the entire loop. If capture does not reliably record source, the Learn step produces nothing.

---

## 4. Target Users

Three personas, one shared pain: lost follow-up.

### Persona A. The Solo Hustler
- **Who:** Boutique retailer; home-based food or beauty brand.
- **Core pain:** Leads come in on WhatsApp/Instagram DMs and get lost. No follow-up system at all.
- **Team size:** 1.
- **Expected plan:** Starter.

### Persona B. The Growing Team
- **Who:** Small distributor; service business with 2–5 reps.
- **Core pain:** No shared view of who is talking to which customer. Deals stall silently.
- **Team size:** 2–5.
- **Expected plan:** Growth.

### Persona C. The Ambitious SME
- **Who:** Established SME scaling its sales function.
- **Core pain:** Marketing spend is not tracked against sales closed. Reporting is manual.
- **Team size:** Dedicated sales team.
- **Expected plan:** Pro.

---

## 5. Modules and Tier Entitlements

Eight modules. Entitlements scale from solo operator to sales team.

| Module | What it does | Starter | Growth | Pro |
|--------|--------------|---------|--------|-----|
| Lead Capture | Web forms, WhatsApp click-to-chat, Facebook/Instagram lead ads into one inbox | ✅ | ✅ | ✅ |
| Contact & Deal Pipeline | Kanban: New → Contacted → Qualified → Proposal → Won/Lost | 100 contacts | 1,000 contacts | Unlimited |
| WhatsApp & SMS Campaigns | Bulk broadcast, templates, scheduled follow-ups | 50 / mo | 1,000 / mo | 5,000 / mo |
| Sales Tasks & Reminders | Auto follow-ups, call logging, next-action nudges | ✅ | ✅ | ✅ |
| Quotes & Invoices | Generate and send; track payment status | no | ✅ | ✅ |
| Campaign Analytics | Cost-per-lead, response rate, conversion-by-source | Basic | Full | Full |
| Team Seats | Reps sharing one pipeline | 1 | 3 | 10 |
| API / Integrations | Accounting, e-commerce, and other business tools | no | no | ✅ |

### Entitlement rules to implement

- **Contact cap** is a hard count per account (100 / 1,000 / unlimited).
- **Message allowance** is a monthly quota (50 / 1,000 / 5,000) covering WhatsApp and SMS combined. Reset cadence and rollover behaviour: see [Open Questions](#12-open-questions).
- **Seats** are hard limits (1 / 3 / 10), with paid overage above the plan limit (see Pricing add-ons).
- **Quotes & Invoices** and **API / Integrations** are binary feature gates, not metered.
- **Campaign Analytics** has two levels, Basic and Full. The deck does not define the split.

### Canonical pipeline stages

`New → Contacted → Qualified → Proposal → Won / Lost`

Whether stages are user-editable is not specified in the deck.

---

## 6. Differentiation

Positioning: not a global CRM squeezed to fit, built local from day one.

| Claim | Substance |
|-------|-----------|
| WhatsApp-native, not email-native | The channel Ghanaian customers and businesses actually use, built into the core workflow. |
| Priced and billed in GHS | Mobile money is a first-class payment method for the subscription itself. No USD friction. |
| Mobile-first for reps who sell from their phone | Not a desktop tool retrofitted with a mobile app, built for the phone from day one. |
| Marketing and sales in one system | ROI per channel is visible without manual reconciliation between separate tools. |

---

## 7. Pricing

Monthly, no long-term lock-in, with an annual discount. Priced to match SME cash flow. All amounts in GHS.

| Plan | Monthly | Annual | Annual saving | Best for |
|------|---------|--------|---------------|----------|
| Starter | 150 | 1,500 | 2 months | Solo owner-operators testing digital lead-gen |
| **Growth** (most popular) | 350 | 3,500 | 2 months | Small teams (2–3 reps) actively selling |
| Pro | 700 | 7,000 | 2 months | Growing SMEs with a dedicated sales team |

### Add-ons
- Extra WhatsApp/SMS message bundles (price not specified in deck).
- Extra team seats at **GHS 25 / seat / month** above the plan limit.
- One-time setup and migration assistance for businesses moving off spreadsheets (price not specified).

### Billing requirements
- Currency: GHS only.
- Mobile money must be a first-class subscription payment method, not a fallback.
- Both monthly and annual billing cycles at launch of the paid product.

---

## 8. Go-to-Market

Seeded from an existing network, not a cold start. Three motions:

1. **Early pilot cohort**. Recruit a small group of early-adopter SMEs as pilot customers to validate the product and gather testimonials.
2. **Partner-led distribution**. Partner with fintech and telecom providers already serving SMEs, reaching customers who already use digital tools. MTN Enterprise is named in the ask as the first target.
3. **Community-led growth**. WhatsApp groups, trade associations, and market queen/leader networks drive word-of-mouth adoption.

---

## 9. Roadmap

Three phases, twelve months to a full sales stack.

### Phase 1. MVP (Months 1–3)
- Lead capture
- Contact and deal pipeline
- WhatsApp/SMS campaigns
- Mobile-first UI

### Phase 2. Sales Ops (Months 4–6)
- Quotes and invoices
- Task automation
- Campaign analytics
- Team seats

### Phase 3. Scale (Months 7–12)
- API integrations
- Payment collection
- AI lead scoring
- Marketplace of templates

### Note on scope sequencing

Phase 1 delivers the Capture → Organize → Engage arc of the core loop. Close and Learn arrive in Phase 2. The pricing table describes the full Phase-2 product, so Starter/Growth/Pro as specified are not all sellable at end of Phase 1. The Quotes & Invoices gate and Campaign Analytics tiers are the differentiators between Starter and Growth, and both are Phase 2. How pilot-cohort billing works during Phase 1 is an open question.

---

## 10. Success Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| Activation | % of new signups that add 10+ contacts and log 1+ deal within 7 days | Not specified |
| Retention | Monthly logo churn | Under 5% by month 6 |
| Expansion | % of Starter accounts upgrading to Growth within 3 months | Not specified |
| Outcome proof | Average increase in lead response rate and deals closed per rep, tracked per cohort | Not specified |

Activation is the only metric with a fully specified event definition (10+ contacts AND 1+ deal, within 7 days of signup), instrument it first.

---

## 11. The Ask

Three decisions requested:

1. Greenlight the Phase 1 MVP build, 3-month scope, already defined.
2. Confirm an initial pilot cohort of SME customers.
3. Align with MTN Enterprise on a partner-led distribution pilot.

---

## 12. Open Questions

Gaps in the deck. Items resolved by [`mvp-scope.md`](./mvp-scope.md) or by a decision record are marked **[RESOLVED]**; the rest still need answers.

**Last reviewed 21 August 2026**, after the product-owner session that settled R1–R9 and A1–A6. That session closed two questions here and opened three.

### Blocks Phase 1 build
- **WhatsApp channel mechanics.** Still open, still the highest-risk item, and **escalated on 21 August: it now gates sign-in.** A1 put authentication behind a one-time code delivered by Fabric (ADR 0029), so if verification cannot reach a Ghanaian number, nobody can log in at all, by any channel. The question to answer before any of the rest is whether Fabric holds its own Meta Solution Provider status or wraps Cloud API — recorded on E3. "WhatsApp-native" spans very different builds: Meta test credentials, Meta Cloud API production access, third-party BSPs, click-to-chat deep links, and a future internal production provider. The demo may use a Meta test account, BSP sandbox, or temporary third-party production-ready account to prove the workflow, but production business verification, template approval, sending limits, and pricing remain unresolved until the production provider path is chosen. All provider choices must sit behind the messaging adapter contract in `architecture.md` §10.1.
- **Inbound WhatsApp capture.** Still open. `mvp-scope.md` §7 hedges this as "WhatsApp-originated lead identification where integration allows" and §12 defers two-way inbox sync. A demo can validate inbound capture through test/sandbox credentials, but production MVP scope depends on repeating the check with the chosen production provider. If inbound capture does not ship, the MVP's lead capture rests on manual entry plus web forms.
- **Message quota economics.** Still open, and now larger than the deck's framing. Per-message cost against the 5,000/mo Pro allowance at GHS 700/mo determines whether the top tier has positive gross margin. **A1 adds a second, unavoidable stream:** every sign-in sends a one-time code, so messaging is now a cost of *logging in*, not only of selling. The 30-day session was chosen to hold that near one message per user per month; shortening it multiplies the bill. Demo credentials prove none of this.
- **[RESOLVED] Mobile-first delivery.** Responsive web across mobile browsers, tablets, and desktop. No native app unless separately approved (`mvp-scope.md` §18). Offline tolerance is not in scope.
- **[RESOLVED] Multi-tenancy and data model.** **Workspace** → Workspace Member → User, with Owner/Administrator and Sales Representative roles. `workspace` was renamed on 21 August (ADR 0030). A user may belong to many workspaces; contacts are copied per workspace and never shared.
- **[RESOLVED] Cross-rep visibility.** Settled 21 August (R3, ADR 0032): an owner sees everything, a rep sees their own records plus everything unassigned, and widening is a per-member grant rather than a workspace-wide switch. Reps claim unassigned leads without waiting for approval. This was the last of the schema-shaping business rules; R1–R9 and A1–A6 are all now recorded in the checklist decision log.
- **GRA invoice certification.** New on 21 August, and it blocks part of what was just added to scope. Ghana's E-VAT mandate has required every VAT-registered business to issue through a GRA-Certified Invoicing System, with pre-issue clearance, since January 2026. Convert is not certified, so the first release ships tax off and labels nothing a VAT invoice (ADR 0033). Whether Convert seeks certification, restricts itself to non-VAT-registered SMEs, or integrates a certified third party is unanswered. Tracked as E8.

### Blocks pricing / packaging

None of these block the MVP build, no billing is in MVP scope, but all block commercial launch.

- Basic vs. Full split for Campaign Analytics.
- Message-bundle add-on pricing and whether unused monthly allowance rolls over.
- Setup/migration assistance pricing.
- What happens on contact-cap or message-quota exhaustion (hard block, soft block, or upgrade prompt).
- How the pilot cohort is billed, given the MVP ships neither billing nor the Growth-tier differentiators.
- **What now separates the tiers, given invoices ship but campaign analytics do not.** The deck used Quotes & Invoices *and* Campaign Analytics as the Starter/Growth dividing line. Invoices moved into the first release on 21 August (§13 amendment A), quotes and analytics did not, and the invoices that do ship are not VAT invoices. So the published tier comparison describes a product that does not exist in either direction.
- **Whether the platform ever takes a share of a transaction.** The plumbing is built and set to zero (ADR 0034). Turning it on is a pricing decision with a promise attached: pilots were told the pilot is free.

### Blocks the attribution promise (P2)
- **[PARTIALLY RESOLVED] Attribution depth.** The MVP ships basic source tracking and "leads by source" only (`mvp-scope.md` §15); complex marketing attribution and cost-per-lead reporting are explicitly out of scope (§20, §21). This means **problem P2, marketing spend is a black box, is not solved by the MVP.** The MVP answers "where did leads come from," not "which spend produced paying customers."
- **Ad-spend input.** Still open, deferred with cost-per-lead. Requires a decision on whether spend is pulled from Facebook/Instagram ad APIs or entered manually. Offline channels named in the problem (flyers, radio, referrals, walk-ins) have no API and need manual entry to appear in ROI at all.
- **Attribution model.** Still open: first-touch, last-touch, or multi-touch, and how a walk-in acquires a source.

### Absent from the deck entirely

Not gaps in this document. Gaps in the pitch. Each is a question an investor or a partner will ask.

- **Market sizing**. SME count, addressable segment, reachable segment.
- **Named competitors and their pricing.** The deck argues against "US/EU tools" generically but names no local or regional incumbent.
- **Unit economics**. CAC, payback period, gross margin per tier.
- **Team and hiring plan.**
- **Budget** for the 3-month Phase 1 build.
- **Data protection compliance.** Ghana Data Protection Act obligations for storing customer contact data and message history. Relevant from the first pilot, not later. Pilot SMEs will upload real customer phone numbers. Now tracked as checklist items L1–L4. **Widened on 21 August:** the product will also hold each workspace's payment-provider credentials and its payment records, which is a materially higher-value target than a contact list — a breach there reaches every pilot SME's payment account at once (S9).
- **Tax and revenue-authority obligations.** Absent from the deck entirely, and not a minor omission: issuing invoices in Ghana is a regulated act, not a formatting exercise. See E8.

---

## 13. Deck vs. MVP Scope Reconciliation

Where [`mvp-scope.md`](./mvp-scope.md) departs from the pitched product. Each divergence is deliberate; the consequences are listed so they are not discovered late.

| # | Deck says | MVP scope says | Consequence |
|---|-----------|----------------|-------------|
| 1 | Pipeline is a single stage list: `New → Contacted → Qualified → Proposal → Won/Lost` (slide 6) | **Two separate state machines**, Lead status `New → Contacted → Qualified → Converted → Lost` (§8) and a Deal pipeline (§9) | The deck conflated lead qualification with deal progression. The scope splits them. **Resolved 21 August 2026 (ADR 0031):** a converted lead's deal enters at `Qualified`; a lead may exist with no deal; `Converted` requires at least one deal; and a deal is an opportunity for **one product**, so a lead may have many. |
| 2 | Quotes & Invoices are the Starter/Growth dividing line and ship in Phase 2 | Deferred entirely (§21) — **reversed 21 August 2026, see amendment A below** | The tier claim was unsellable while invoices were deferred. Invoicing is now in the MVP (ADR 0033), but **without VAT clearance**, so the paywall claim still should not be made to pilots and the pilot stays free (P3). |
| 3 | Campaign Analytics with cost-per-lead and conversion-by-source is a Phase 1–2 module | Basic source tracking only; complex attribution out of scope (§15, §20) | Problem P2 remains unsolved after the MVP. This is the deck's second-strongest claim, so the pilot cannot validate it. Say so explicitly in pilot success criteria. |
| 4 | "Bulk broadcast" WhatsApp/SMS campaigns, 50–5,000 messages/month by tier | Lightweight campaigns; bulk "should remain limited unless required by pilot customers" (§13, §14) | Message-tier pricing is untested by the MVP. Volume-driven cost risk moves to post-MVP. |
| 5 | Mobile-first "not a desktop tool retrofitted with a mobile app" | Responsive web; native app out of scope (§18, §20) | Defensible for a pilot, but it weakens the differentiation claim on slide 7 versus competitors that ship native apps. Responsive quality is therefore a product risk, not just a QA concern. |
| 6 | Three personas served (slide 5) | Primary target narrowed to the **Growing SME Sales Team**, 2–5 reps (§4) | Correct call. The collaboration pain is the differentiator, and a solo user cannot validate it. Starter-tier (1 seat) demand goes unvalidated by the pilot. |
| 7 | Team seats capped 1 / 3 / 10 with GHS 25/seat overage | Seat entitlements and billing not in MVP scope (§5, §20) | Seat limits must not be hardcoded during the MVP; leave the entitlement boundary at a layer that can later enforce caps. |

### Amendment A — commerce enters the MVP, 21 August 2026

Decided by the product owner in the R1–R9 / A1–A6 session. `mvp-scope.md` remains authoritative on
everything else; these rows record where it has been deliberately overridden, because a `grep` for
`sku|product catalog|catalogue|inventory|line item|order` across `mvp-scope.md` returns nothing and
quotes, invoices and payments sit in its Out list.

| # | `mvp-scope.md` says | Now decided | Consequence |
|---|---------------------|-------------|-------------|
| A1 | No product or SKU catalogue anywhere | **Products and services in the MVP**, one entity with a kind flag, referenced by leads and deals (ADR 0033) | A deal is per-product (ADR 0031), so the catalogue is a prerequisite rather than an addition. Price is snapshotted onto the deal, so a catalogue edit never rewrites history. |
| A2 | No file storage of any kind | **A reusable media library**, several images per product, one primary (ADR 0033) | Introduces an **object storage dependency** — provider, region matching the same-region constraint, upload limits, resized derivatives. Needs its own ADR. Only primary derivatives may load in list views or G9 fails. |
| A3 | Invoices out (§21) | **Invoices in**, draft accumulator per contact, gapless per-workspace numbering, immutable on issue, credit notes for corrections (ADR 0033) | Largest single addition. Ghana's **E-VAT mandate has been in force since January 2026**: VAT-registered businesses must issue through a GRA-Certified Invoicing System with pre-issue clearance, and non-certified software cannot produce a valid VAT invoice. Convert is not certified. Mitigation: tax **off by default**, documents labelled "Invoice"/"Receipt" and never "VAT Invoice", clearance columns left nullable so certification is a code path rather than a migration. **Accepted residual risk:** nothing stops a VAT-registered SME using it and believing the output is valid. Belongs in the pilot agreement and onboarding. |
| A4 | No tax handling | **A named `tax_rate` per workspace, composed of components**, selected per product, snapshotted per invoice line (ADR 0033) | Ghana stacks levies, so a single percentage per product cannot express reality, and a legislative change would otherwise mean editing the whole catalogue. |
| A5 | Payments/billing out | **Payment collection, optional per workspace**, into the SME's **own** Mobile Money merchant account; Convert never holds funds (ADR 0034) | Convert stays a software company — no Bank of Ghana licensing, no float, no chargeback liability. Manual payment recording is the baseline, so **payments are not on the MVP critical path**. Convert forgoes transaction revenue: the commercial model rests entirely on subscriptions. Requires encrypted per-workspace merchant credentials, which is the highest-value breach target in the system. |
| A6 | Single web app | **A platform-admin surface, deferred**; marketing site outside this repository; customer invoice pages are unauthenticated routes in `apps/web` (ADR 0035) | Introduces a fourth principal that crosses tenancy, so **I1 is no longer absolute** — it now names an audited exception. |

**Schedule consequence, stated plainly:** this is a larger body of work than everything currently
scoped for deals, on an MVP with no feature code written. The schedule needs re-cutting rather than
absorbing it.
| 8 | Mobile money as a first-class subscription payment method | Payments deferred (§21) | No subscription billing in the MVP at all. The GHS/mobile-money differentiation is unproven until post-MVP. |
| 9 | Attribution loop closes: "spend shifts toward what works" (step 5, slide 4) | Learn step reduced to a dashboard of counts and leads-by-source (§15) | The five-step "continuous loop" becomes a four-step funnel in the MVP. Capture → Organize → Engage → Close(deal outcome only). |
| 10 | Phase 1 MVP is four items: lead capture, pipeline, WhatsApp/SMS campaigns, mobile-first UI (slide 10) | Adds team seats/invites/roles (§5), follow-up tasks and reminders (§11), and a dashboard (§15), three of the four **Phase 2** items, while deferring only quotes/invoices | **The MVP is materially larger than deck Phase 1.** The additions are justified (the 2–5 rep persona is meaningless without seats; reminders are the direct fix for P1), but slide 12's "3-month scope, already defined" no longer describes what is being built. Re-estimate before the greenlight decision. |

### Net position

The MVP validates the deck's **first claim**, one shared place to capture, assign, follow up, and close, and defers the **second**, visible marketing ROI per channel. The demo may validate the WhatsApp workflow using test/sandbox/temporary provider credentials, but that does not validate production WhatsApp approval, limits, or economics. That is the right sequencing for a 3-month pilot, but the ask on slide 12 and any pilot pitch should be worded to match, otherwise pilot SMEs expect ROI reporting and production-grade WhatsApp readiness that will not be there.

---

## Appendix. Deck slide map

| Slide | Section | Spec section |
|-------|---------|--------------|
| 1 | Title | Header |
| 2 | The Problem | §1 |
| 3 | The Solution | §2 |
| 4 | How It Works | §3 |
| 5 | Who It's For | §4 |
| 6 | Product | §5 |
| 7 | Why Convert Wins | §6 |
| 8 | Pricing | §7 |
| 9 | Go-to-Market | §8 |
| 10 | Roadmap | §9 |
| 11 | Success Metrics | §10 |
| 12 | The Ask | §11 |
