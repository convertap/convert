# ADR 0034 - Payments settle to the SME's own mobile money account, and Convert never holds funds

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

ADR 0033 put invoices in the MVP. The product owner then wanted those invoices payable — a link or button in the WhatsApp message, with Mobile Money as the point, since card penetration among Ghanaian SMEs and their customers is thin.

Payments and billing are in `mvp-scope.md`'s Out list, so this is part of the same scope amendment. But it carries something the rest of that amendment does not: a **financial-regulatory** question. Whoever receives the money first is the party holding client funds, and in Ghana that is Bank of Ghana payment-service-provider territory, with settlement, refund and chargeback liability attached.

Provider research produced a hard constraint. Paystack's subaccount-and-split model — which would let Convert take a platform fee automatically at settlement — creates subaccounts against a **bank account**, validated through the Resolve Account endpoint. Paystack Ghana *can* send money to mobile money wallets, but through **Transfers**, a disbursement from the platform's own balance. Hubtel receives all funds into a single merchant account and settles onward to a bank account or a mobile wallet. MTN's Collections API is available in Ghana with credentials issued per merchant through the OVA dashboard after KYC.

Which produces a trilemma. Of these three properties, only two are available together:

| | Consequence |
|---|---|
| MoMo settlement + Convert never holds funds | Each SME needs **their own** merchant account |
| MoMo settlement + automatic split fee | Convert collects first → **holds client funds** → licensing |
| Split fee + never holds funds | Bank-account settlement → **excludes unbanked SMEs** |

The product owner chose MoMo settlement plus never holding funds, and then made the decisive refinement: **payment collection is optional**, because an invoice can be marked paid by hand.

## Decision

**Money never touches Convert.** Payment is collected into **the SME's own merchant account** — Hubtel or MTN direct — and Convert initiates a charge against it. This keeps Convert a software company and keeps Bank of Ghana licensing entirely off the table.

**Convert takes no automatic cut.** The platform fee is billed through the subscription instead. The split capability is still built — a platform-wide default the system administrator sets, with an optional per-workspace override, stored in pesewas or basis points and **snapshotted onto each transaction** so a fee change never restates historical settlements — and it lies dormant until a provider offers MoMo-settled splits. Pilot SMEs were promised a free pilot (P3), so charging a transaction fee would contradict that anyway.

**Connecting a merchant account is per-workspace and optional, and manual payment recording is the baseline.** This is the most consequential line in the record. An SME with no merchant account still issues invoices, sends them, and records payment by hand — cash, a MoMo transfer done outside the system, a bank deposit. The pay button appears only where a merchant account is connected.

Three things follow, and the third is why it matters most:

- Invoices no longer depend on payments at all.
- Onboarding is not gated on KYC or OVA approval, so a pilot SME is productive on day one.
- **Payments leave the MVP critical path.** Provider selection between Hubtel and MTN, and the per-workspace credential storage below, stop blocking the schema and become a later increment.

**One `payment` table, every row tagged with its origin — `manual` or `psp` — and invoice status derived from the sum.** Never a hand-set paid flag that can disagree with the amounts beneath it, and never a webhook that *sets* invoice state. A provider callback inserts a payment and the status recomputes. Callbacks are made idempotent on the provider's reference through `provider_event`, which `architecture.md` §6 already defines for exactly this. Partial payments are ordinary, because SMEs take deposits.

**"Paid" lives on the invoice, not the deal.** A rep thinks in deals, so the deal view offers "mark paid" — and it writes a payment row against that deal's invoice, issuing the invoice first if none exists. Same button, one ledger. A paid flag on the deal would be a second source of truth and would drift from the invoice within a week.

**Collection sits behind a `PaymentPort`**, in the same spirit as ADR 0005's messaging port and ADR 0029's verification port, and for the same reason: no provider payload may reach invoices, deals or contacts. MoMo is not card-shaped — it is typically an approval prompt on the customer's handset — so the port must model a **pending** state that cards do not have.

**The payment link carries a signed, unguessable, expiring token.** Tapping it goes straight to payment with nothing to type. The owner's original flow asked the customer to enter an invoice ID; that is a step that can fail, and an ID a customer can type is an ID an attacker can enumerate across tenants. ID entry survives only as a counter fallback for someone holding a paper invoice. SMS has no buttons and gets a short link; WhatsApp can use a template URL button, subject to E4 approval and its dynamic-suffix rules.

**The SME is the merchant of record throughout** — their name, TIN and tax label on the document, their name on the payment page where the provider allows it. Convert is invisible in the money path, which is both correct and what stops customers abandoning at an unfamiliar name.

## Consequences

**Positive:** no licensing exposure, no float, no settlement or chargeback liability, and no client funds. Optional connection removes the adoption risk of making every SME complete a KYC process before they can use the product. The single derived-status ledger means manual and provider payments cannot disagree. And the port keeps provider choice reversible, which matters because the provider comparison has not been done.

**Negative / cost:** Convert stores **per-workspace merchant credentials**, and ADR 0020 puts *our* secrets in Infisical, which is the wrong tool for thousands of tenant-owned API keys. That needs encrypted-at-rest per-workspace credential storage with its own key management, and a breach there is every pilot SME's payment account at once — the highest-value target in the system. Convert also forgoes transaction revenue, so the commercial model rests entirely on subscriptions. Each SME must obtain their own merchant account to accept payment in-product, which is friction Convert cannot remove. And the split plumbing is built but unused, which is speculative work justified only by how cheap it is next to retrofitting it.

**Rejected alternatives:**

- *Convert collects and remits, with a wallet per SME.* What the owner initially asked about, and the only shape that gives MoMo settlement *and* an automatic split. Rejected because holding client funds is a company-shaping regulatory decision, not a feature, and would need legal advice before a schema.
- *Paystack subaccounts with split settlement.* The cleanest technical fit and a real revenue line. Rejected because settlement resolves to a bank account, which excludes precisely the market-stall and small-shop SMEs the product targets.
- *Require a connected merchant account.* Simpler product with one payment path. Rejected on the owner's correction, and rightly — it would have gated onboarding on KYC and put provider selection on the critical path.
- *A paid flag on the deal.* What the owner described. Rejected as a second source of truth; the same button is preserved, writing to the one ledger.
- *Customer types the invoice ID.* The owner's original flow. Rejected for friction and cross-tenant enumeration; kept as a paper fallback.

## Enforcement

- A `.boundaries.json` forbidden-external so no layer above `packages/infra` imports a payment provider SDK; G1 then fails the build if it happens. Same rule as ADR 0029's verification port.
- New invariants: invoice payment status is **derived**, never stored as a settable flag; a provider callback is idempotent on its provider reference; a fee change never alters a settled transaction's snapshotted fee.
- Per-workspace credentials are encrypted at rest with a key Convert holds separately from the database, and never logged. This needs its own ADR before the first credential is stored.
- The Hubtel-versus-MTN comparison — MoMo coverage, settlement timing, fees, KYC burden — is an outstanding checklist item, no longer blocking, and must be done before the port gets its first real implementation.
