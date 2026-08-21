# ADR 0036 - WhatsApp goes direct to Meta; Fabric carries SMS and sign-in codes

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

Checklist **E3** — the production provider path — has been the highest-risk open item in this project since the checklist was written, and `HANDOFF.md` §1 named the question that had to be answered before anything else: does Fabric hold its own Meta Solution Provider status, or does it wrap Cloud API?

ADR 0029 raised the stakes. Sign-in is a one-time code delivered through a verification port with Fabric behind it, so Fabric stopped being a marketing-timeline concern and became the front door. A verification outage would lock every user out at once, by every channel.

Two things then settled the question from a different direction.

**Facebook and Instagram lead ads went into scope** (E6, ADR 0037). Those require a Meta app, Meta Business verification, and app review for the leadgen webhook permission. So Convert needs a direct relationship with Meta regardless of how WhatsApp is reached.

**Which makes routing WhatsApp through Fabric a second integration for the same platform.** Two paths to Meta — one direct for ads, one wrapped for WhatsApp — means two sets of credentials, two failure modes, and two places a Meta policy change lands, for one company's API.

## Decision

**WhatsApp uses Meta Cloud API directly.** One Meta app, one Business Manager, one verification, covering both lead ads and WhatsApp.

**Fabric carries SMS and the authentication codes.** It remains the implementation behind the `VerificationPort` of ADR 0029 and behind the SMS half of the messaging port of ADR 0005. It is no longer in the WhatsApp path.

**Sign-in codes go over SMS, not WhatsApp.** This retires the WhatsApp authentication-template question entirely, and it is the more important half of this record: authentication now depends on no Meta approval whatsoever. Login works before WhatsApp does.

**The demo splits accordingly.** WhatsApp inbound capture is proven against **Meta test credentials**, because that is the production path and a spike should exercise the path it is proving. Fabric's own test environment covers SMS and codes, at no cost to us. The §7 spike still has to prove exactly three things: a template sends, an inbound webhook arrives and matches a contact by phone, and a delivery status persists.

**Both stay behind their ports.** No Meta payload and no Fabric payload may reach contacts, leads, campaigns, tasks or activities. That rule predates this decision and is what makes it reversible.

## Consequences

**Positive:** authentication is decoupled from Meta. That is worth more than it sounds — E1, E2 and E4 are multi-week waits controlled by an external party, and under the previous shape a login screen could not be finished until they cleared. Now it can. One Meta relationship serves ads and WhatsApp, so verification happens once and a policy change lands in one place. Going direct also removes a markup: Meta's per-conversation rate with no reseller margin, which matters because per-conversation cost is what decides whether the GHS 700 Pro tier has positive margin. And the messaging surface is smaller: Fabric is no longer a single point of failure for both channels at once.

**Negative / cost:** **E1, E2 and E4 are firmly on Convert's critical path and cannot be delegated.** Meta Business verification needs the Ghanaian entity's registration certificate and proof of address, the WhatsApp Business Account needs a phone number **not already registered on WhatsApp** — which rules out every rep's personal number and any line running the WhatsApp Business app — and templates need approval. Days to weeks, none of it under our control, and the hope that Fabric's own status might absorb this is now explicitly abandoned. Going direct also means Convert owns what a BSP would have handled: onboarding, number provisioning, template submission, and the quality-rating and tiered-sending-limit rules that throttle a number with poor engagement.

Fabric still gates sign-in. Nothing here changes that. It narrows the blast radius to one channel rather than two, and it means a Fabric outage stops logins and SMS while WhatsApp keeps working — which is a better failure mode than everything stopping together, but it is not a fix. Configuring a second verification implementation remains outstanding work.

And SMS codes cost money per login, forever, with no WhatsApp fallback to make them cheaper. The 30-day session (ADR 0029) is what holds that near one message per user per month.

**Rejected alternatives:**

- *Fabric for WhatsApp as well.* The shape this replaces. Rejected once lead ads made a direct Meta relationship unavoidable: wrapping one Meta product while integrating another directly is two integrations for one platform, and it leaves Fabric as a single point of failure across every channel including login.
- *A third-party BSP (Twilio, 360dialog, Infobip, or a local reseller).* Handles onboarding, number provisioning and template submission, which is real work we now own. Rejected because it adds a markup on the metric that decides top-tier margin, and because the same Meta verification is needed for lead ads anyway — so the BSP would remove none of the calendar-bound waiting.
- *Sign-in codes over WhatsApp.* Cheaper per message and near-universal among Ghanaian SMEs. Rejected because it would put login behind Meta's authentication-template approval, reintroducing exactly the dependency this decision removes. Revisit as a cost optimisation once WhatsApp is live and approved.
- *Proving the WhatsApp demo through Fabric's sandbox.* Free, and it was the instinct. Rejected because the spike would then exercise a path the product will not use; a spike that proves the wrong integration has proven nothing.

## Enforcement

- `.boundaries.json` forbidden-externals so no layer above `packages/infra` imports a Meta or Fabric client. G1 fails the build otherwise. This is the same rule ADR 0029 and ADR 0005 already require, now covering two providers.
- I10 still holds: a free-form WhatsApp message requires an open conversation window, otherwise only an approved template may be sent. Going direct does not soften Meta's rules; it means we implement them ourselves.
- The demo spike's exit criterion is unchanged and written down in the checklist §7: a written yes or no to "can inbound WhatsApp lead capture work through the adapter", with provider limitations recorded separately from product limitations.
- E1, E2 and E4 stay open, calendar-bound, and owned by Convert. E3 closes with this record.
