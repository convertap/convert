# ADR 0037 - Facebook and Instagram lead ads are in scope

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

Checklist **E6** asked whether Meta lead ads are in or out of the first release. The deck promises them on slide 6; `mvp-scope.md` §7 hedges them as "may be introduced depending on implementation complexity". The checklist notes that if they are in, Meta app review for the leadgen webhook permission is further lead time that must start alongside E1.

The engineering recommendation was **out**: app review is another calendar-bound wait stacked on E1, E2 and E4, and the same lead can arrive through click-to-WhatsApp, which is already the headline capture path.

**The product owner decided they are in.** Recorded here with the cost named, because the recommendation went the other way.

The decision is not arbitrary. Lead ads are how a Ghanaian SME actually buys reach, and the deck's capture story is thin without them: a business that pays for a Facebook ad and then copies enquiries into a spreadsheet by hand has not been helped. It also composes with two decisions made the same day — a lead may reference the products it came in for (ADR 0031), and an ad promotes a specific product, so ad-sourced leads arrive already attributed to the thing the customer wants.

## Decision

**Facebook and Instagram lead ads are in the first release.** A submitted lead form arrives by webhook, creates or matches a contact by phone number, and produces a lead with source `Facebook` or `Instagram` and the advertised product attached.

**Meta app review for the leadgen webhook permission starts alongside E1**, not after it. It shares the Meta app, Business Manager and verification that ADR 0036 already requires for WhatsApp Cloud API, so the verification work is done once rather than twice — which is part of why going direct to Meta was the right call.

**The webhook is signature-verified, idempotent and replay-safe**, per checklist S4. Meta retries; duplicates will arrive. The raw payload is stored in `provider_event` before interpretation, which `architecture.md` §6 already defines for exactly this, and idempotency keys off Meta's own identifier for the submission.

**Consent is captured from the form, not assumed.** A lead-ad form collects the customer's details directly inside Meta, so the consent record has to store what that form actually said at the moment of submission, alongside the channel, timestamp and source (ADR 0008, L3). A lead arriving through an ad is not a lead that agreed to marketing, and I9 blocks a marketing send with no live consent regardless of how the contact arrived.

## Consequences

**Positive:** the deck's capture promise becomes real rather than hedged, and the highest-intent channel an SME pays for lands in the product automatically. Combined with per-product leads, an ad-sourced lead arrives knowing which product drew it, which is the raw material for the "leads by source" reporting that is in scope — and the first honest step toward the cost-per-lead attribution that is not. It also shares the Meta app and verification with WhatsApp, so the marginal onboarding cost is app review rather than a second platform relationship.

**Negative / cost:** **another external approval on the critical path.** Meta app review for `leads_retrieval` is a submission with screencasts, a privacy policy and a use-case justification, reviewed on Meta's schedule, and it can come back with change requests. It stacks on E1, E2 and E4 rather than running independently, because all of them hang off the same Business verification. The engineering recommendation was to defer precisely to avoid this, and the schedule should assume a rejected first submission rather than a clean pass.

It also widens the data-protection surface: personal data now enters Convert from a third-party form the customer filled in somewhere else, which makes the consent wording someone else's page and the record of it ours. That has to be reflected in L2's sub-processor disclosure and L3's consent model, both of which are still open.

And it adds a second inbound webhook path to build, verify and monitor, on top of WhatsApp's. Two providers, two signature schemes, one idempotency discipline.

**Rejected alternatives:**

- *Out of the MVP, revisit after the pilot.* The engineering recommendation, on lead-time grounds. Overruled. The counter-argument is sound: an SME's paid reach is the channel most worth automating, and leaving it out means the pilot cannot test the capture story the deck sells.
- *Click-to-WhatsApp only.* Already in scope and cheaper, since it needs no app review. Rejected as a *replacement* rather than a companion: it captures people who choose to message, not people who fill in a form, and Meta's ad tooling pushes both.
- *Manual CSV export from Meta Ads Manager.* No app review at all, and it works on day one. Rejected because a rep exporting a spreadsheet is the behaviour the product exists to replace, and lead speed is the thing being sold.

## Enforcement

- **S4** covers the webhook: signature-verified, idempotent, replay-safe. `provider_event` stores the raw payload before interpretation.
- **I9** blocks a marketing message without live consent for that channel, which applies to ad-sourced contacts identically to any other.
- **I2** handles the contact match: an ad submission carrying a phone number resolves against every stored number, not just the primary, so an ad lead does not create a duplicate contact.
- E6 closes with this record. Meta app review becomes a tracked, calendar-bound checklist item alongside E1, E2 and E4.
