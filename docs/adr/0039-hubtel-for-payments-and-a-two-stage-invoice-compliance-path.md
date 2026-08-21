# ADR 0039 - Hubtel for payments, and a two-stage path to lawful invoicing

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

ADR 0034 settled that payment collects into the SME's own Mobile Money account and that Convert never holds funds, leaving **E9** — which provider — open but not blocking, since manual recording is the baseline. ADR 0033 admitted invoices into scope while recording that Convert is not a GRA-Certified Invoicing System, leaving **E8** open and genuinely blocking anything VAT-labelled.

Both now have answers.

**On the provider.** Hubtel is Ghana-based, covers MTN MoMo, Telecel Cash and AirtelTigo Money alongside cards and GhQR, and settles onward to a bank account **or a mobile wallet** — the property that matters, because a bank-only settlement path excludes the market-stall and small-shop SMEs this product targets. That is what removed Paystack from consideration for this purpose: its subaccount model resolves a bank account.

**On certification, the path turned out bounded rather than open-ended.** Ghana's E-VAT mandate has required every VAT-registered business, with no revenue threshold, to issue through a Certified Invoicing System since January 2026, cleared by the GRA's controller before the customer sees the document. Becoming certified means **Joint User Acceptance Testing with the GRA, roughly four weeks with their support**, integrating against the VSDC API. Four weeks of testing is a bounded project, not an unknown.

## Decision

### Payments: Hubtel

**Hubtel is the payment provider**, behind the `PaymentPort` of ADR 0034 so nothing provider-shaped reaches invoices, deals or contacts.

The port must model a **pending** state, because Mobile Money is not card-shaped: a charge produces an approval prompt on the customer's handset, and the answer arrives later or never. A design that assumes synchronous success will be wrong for the commonest payment method in the market.

Whether Hubtel offers OAuth rather than a stored API secret is a question for the integration work (ADR 0038). A revocable token is preferred; the storage design stands either way.

### Invoicing: two stages, in this order

**Stage one, now: serve businesses that are not VAT-registered.** Most micro-SMEs sit below the VAT registration threshold, so a plain invoice or sales receipt is lawful for them. Tax stays off by default, no document is labelled a VAT invoice, and the nullable clearance columns from ADR 0033 stay in place. The pilot proceeds on this basis.

**Stage two, as a funded workstream: pursue GRA certification.** Four weeks of Joint UAT against the VSDC API is cheap for what it buys. Being a certified CIS is a genuine moat for a Ghanaian SME product — every competitor faces the same gate, and an SME that must issue VAT invoices cannot use a product that cannot clear them. This is the rare compliance obligation that is also a differentiator.

**Until stage two completes, the product must not present itself as capable of VAT invoicing.** That is a statement about onboarding copy and the pilot agreement as much as about the software.

## Consequences

**Positive:** a single Ghanaian provider covers every Mobile Money network the market uses, settles to wallets rather than only banks, and is local enough to actually reach when something breaks. On invoicing, the two-stage path means the pilot is not held hostage to a regulator: it ships lawfully to the businesses it can serve, while certification proceeds in parallel rather than as a prerequisite. And naming certification as a moat rather than a cost changes how it gets resourced.

**Negative / cost:** one provider means one dependency, and Hubtel's outage is the product's outage for payment collection — mitigated only by manual recording remaining the baseline, which is exactly why ADR 0034 made collection optional. Settlement at T+1 to T+3 means an SME does not see money immediately, which will generate support questions the product cannot answer.

On invoicing, stage one leaves a real gap that is not closed by software: **a VAT-registered business can use the product and assume the output is valid.** Nothing prevents it. That risk was accepted in ADR 0033 and it persists until certification lands; it belongs in onboarding copy and the pilot agreement, in words a shop owner understands. Stage two is also a commitment of four weeks of engineering attention to a regulator's test cycle, on a schedule already re-cut once today, and Joint UAT can fail and repeat.

The provider comparison behind this decision was also thinner than it should be: Hubtel's Mobile Money settlement, coverage and local presence are documented, but a like-for-like comparison of **fees** against MTN direct was not completed. That is a gap worth closing before volume matters, and it does not change the choice today.

**Rejected alternatives:**

- *MTN Collections API directly.* Free API access and no intermediary. Rejected because it covers one network: an SME's customers are on MTN, Telecel and AirtelTigo, and integrating three separately is three KYC processes and three failure modes for what Hubtel provides once.
- *Paystack.* The strongest split-payment tooling and a real revenue line through subaccounts. Rejected in ADR 0034 already: settlement resolves a bank account, which excludes the unbanked SMEs this product exists for.
- *Certify before the pilot.* The conservative order. Rejected because it puts a regulator's four-week test cycle in front of the first real user, and the pilot can be served lawfully without it.
- *Never certify; stay with non-VAT-registered businesses permanently.* Viable, and it caps the addressable market at businesses below the VAT threshold — which is the segment that grows out of the product exactly when it starts working.
- *Integrate a third party's certified system.* Faster than certifying, and it makes invoice validity depend on another vendor's compliance and pricing, on the one document an SME cannot afford to have rejected. Worth revisiting if Joint UAT proves harder than four weeks suggests.

## Enforcement

- **E9 and E3 close; E8 moves from "unanswered" to "stage two, scheduled".** Its checklist row keeps ⛔ against any VAT-labelled document.
- `.boundaries.json` forbidden-external for the Hubtel client, so it stays inside `packages/infra`. G1 enforces it.
- New invariant: an invoice with tax components requires a GRA clearance reference before it can be marked issued. That makes the compliance rule structural rather than a matter of remembering — the software cannot issue a tax-bearing document uncleared, whatever a future setting says.
- Provider callbacks stay idempotent on Hubtel's own reference via `provider_event`, as ADR 0034 requires.
- The missing fee comparison against MTN direct is recorded as outstanding on E9 rather than treated as done.
