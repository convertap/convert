# ADR 0040 - How consent is captured, blocked on, and withdrawn

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

Checklist **L3** is simultaneously three things: an obligation under Ghana's Data Protection Act 843, a Meta requirement (marketing templates only reach contacts who opted in beforehand), and a database column. It has been blocking because **consent cannot be retrofitted.** Import five hundred contacts with no record of how and when each agreed, market to them a month later, and there is no answer to "when did they agree, and to what" — and no way to obtain five hundred retroactive yeses.

ADR 0008 already decided the *shape*: consent is an append-only record carrying channel, timestamp and source, and withdrawal adds a row rather than erasing one. I9 blocks a marketing send with no live consent. What was missing was the operating rules — which the product owner settled on 21 August.

The gap that made this urgent rather than merely important: the product is about to gain a contact importer, a campaign sender, and a lead-ad webhook that receives personal data from a form filled in on Meta's page (ADR 0037). Each of those is a place consent either gets recorded correctly or is lost permanently.

## Decision

**An inbound WhatsApp message is not marketing consent.** A customer messaging the business opens a 24-hour window to reply *to them*; it says nothing about sending a promotion next Tuesday. Service replies and marketing are separate concepts with separate permissions, and conflating them is the fastest route to a Meta quality-rating problem — which throttles the number for every other purpose too.

**Imported contacts arrive with no marketing consent, and campaigns to them are blocked.** Individual calls and messages remain available, because a rep talking to their own customer is not a campaign. Only bulk marketing is gated. This is the rule that makes the importer safe to build: the default is "no", and no import path can quietly create consent that nobody gave.

**The exact wording shown at capture is stored with the record.** "Consented: true" is not evidence, because it does not say what was agreed to — a box reading *"I agree to receive order updates"* is not permission to send promotions. Wording also gets edited over time, so it cannot be reconstructed after the fact. One text column, and it is the difference between having a defence and not.

For a **lead-ad submission**, that means storing what Meta's form said at the moment of submission. The wording is someone else's page; the record of it is ours.

**Withdrawal has three entry points and one mechanism:**

- `STOP` replied to an SMS
- an unsubscribe link in a WhatsApp message
- a rep marking it, after a customer says so on a call

All three write the same append-only record. Withdrawal never deletes the original consent, which is counter-intuitive and protective: the history then shows the contact agreed in March and withdrew in August. Deleting the consent row would make it look like the business had been marketing to someone who never agreed at all.

**The remaining open part is the legal text, not the mechanism.** The wording of the capture statement and the opt-out message needs a lawyer. L3 therefore moves to partially resolved rather than closed.

## Consequences

**Positive:** every path that creates a contact now has a defined consent outcome, so the importer, the campaign sender and the lead-ad webhook can all be built without leaving a hole that cannot be closed later. Defaulting imports to "no consent" means the unfixable failure — marketing to five hundred people who never agreed — is structurally impossible rather than a matter of remembering. Storing the wording converts a compliance claim into evidence. And keeping service replies separate from marketing protects the sending quality rating that every other WhatsApp feature depends on.

**Negative / cost:** the honest one first. **`STOP` on SMS requires receiving SMS, which nothing in this project currently requires.** Checklist E5 only asks that the SMS provider expose a *delivery-report* webhook; inbound reception and keyword parsing are a different capability, and Fabric's support for it is unverified. If it turns out Fabric can only send, then either the SMS withdrawal route does not ship as specified or the provider requirement changes — and it would be worse to discover that after telling a regulator that `STOP` works. This is now a question for E5.

The WhatsApp unsubscribe link needs the same signed, expiring URL infrastructure the invoice link needs (ADR 0034), so those two should be built once rather than twice.

Blocking campaigns to imported contacts will read as the product being broken. An SME that has just imported their customer list and cannot send them anything will need a clear explanation and a route to collecting consent, or they will conclude the import failed. That is an onboarding and copy problem created deliberately by this decision, and it is the correct trade.

**Rejected alternatives:**

- *Treat an inbound message as consent.* Convenient, and it would make the WhatsApp capture path immediately marketable-to. Rejected on both law and Meta's rules, and because the quality-rating damage is shared across every message the business sends.
- *Let the SME assert consent for imported contacts at import time.* Faster onboarding, and it puts the legal exposure on the SME who ticks the box. Rejected: it is exactly the retroactive-consent fiction this decision exists to prevent, and the SME cannot honestly assert what they never recorded.
- *A boolean consent flag on the contact.* One column, no history. Rejected in ADR 0008 already, and this record depends on that: a flag cannot show that consent was given and later withdrawn, which is the state that protects the business.
- *`STOP` only, no other withdrawal route.* Cheapest. Rejected because a WhatsApp recipient has no natural way to reply `STOP` to a template, and a rep hearing "stop texting me" on a call needs somewhere to put it.

## Enforcement

- **I9** already blocks a marketing message without a live consent record for that channel at send time. This record defines what makes one live.
- A new invariant: **a campaign send excludes any contact with no live consent for that channel**, and the exclusion is visible in the campaign's per-recipient state rather than silent. `campaign_recipient` exists for exactly that.
- A new invariant: **an import never creates a consent record.** The cheapest guard against a future convenience feature reintroducing the unfixable failure.
- The captured wording is stored on the consent row and is not nullable when the source is a form.
- Inbound SMS reception moves onto **E5** as a provider requirement, alongside the delivery-report webhook, rather than being assumed.
- L3 becomes partially resolved: the mechanism is decided, the legal text is not.
