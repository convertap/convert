# ADR 0033 - Products, invoices and tax enter the MVP, and what that costs

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

ADR 0031 made a deal an opportunity for one SKU. That decision needs the SKU to come from somewhere, and the product owner then went further: a catalogue of products and services in the MVP, with **images**, and invoices issued from won deals and sent to the customer.

Every one of those is in `mvp-scope.md`'s **Out** list. A `grep` for `sku|product catalog|catalogue|inventory|line item|order` across the whole of `mvp-scope.md` returns nothing, and quotes, invoices and payments are excluded explicitly. `product-spec.md` §13 row 2 already records the consequence of deferring invoices: the published pricing tiers are "not sellable from the MVP".

So this is a scope amendment, decided by the product owner on 21 August, and recorded as one rather than absorbed silently. It is the largest change to this project's scope since the scope was written.

**One finding dominates the invoice half of it.** Ghana's E-VAT mandate has been in force since **January 2026**. All VAT-registered businesses must issue invoices through a **Certified Invoicing System** connected to the Ghana Revenue Authority, with **no revenue threshold**. It is a clearance model: an invoice must be approved by the GRA's Virtual Sales Data Controller *before* reaching the customer, and only invoices carrying a clearance number, digital signature and QR code are legally valid. Non-certified software cannot produce a valid VAT invoice, and issuing without clearance exposes the business to criminal penalties. The mandate covers tax invoices, receipts, refunds and credit notes.

Convert is not a certified system. The product owner's decision was to build invoicing now and address E-VAT later.

## Decision

**Products and services are one entity with a kind flag.** They differ in whether stock or duration matters, and the MVP tracks neither, so two tables would be duplication.

**A deal references the product *and* snapshots its name and unit price at deal creation**, in integer pesewas (R5). The invoice copies from the deal. One snapshot point, so the invoice agrees with the deal it came from by construction. Without it, editing a catalogue price rewrites open deals' values and last month's forecast.

**Images are a workspace-scoped media library**, reusable across products, several per product, one flagged primary, ordered. Deletion is a soft delete that refuses while references exist. **Only the primary image loads in list views, at a resized derivative** — a gallery of full-size photos in a pipeline view on a Ghanaian mobile network fails the 2.5 s LCP budget outright, and G9 exists to catch exactly that.

**Invoices accumulate as drafts.** The first won deal for a contact opens a draft invoice; further deals won for that contact append to the same draft; **issuing** closes it, freezes the line items and assigns a **gapless per-workspace number**. This satisfies both of the owner's rules at once — the document exists the moment a deal is won, and same-period deals for one contact share an invoice — with one mechanism rather than a scheduler. The draft is closed by the SME pressing issue, with an optional per-workspace auto-issue after N days; a time-based close firing mid-negotiation would send a customer half their order.

**An issued invoice is immutable. Corrections are credit notes.** Consistent with I5's terminal deal outcomes and I6's append-only activity log.

**Tax is a named `tax_rate` at workspace level, composed of one or more components.** Each product references a rate, or none for exempt. The invoice line **snapshots the resolved name and percentages at issue**. Per-SKU selection is preserved, one row changes when law changes, and stacked levies — which Ghana uses — are expressible, where a single percentage on each product is not.

**Tax defaults to off, and no document is labelled a VAT invoice.** This is how "build it now, E-VAT later" is honoured without creating liability. The criminal exposure attaches to a specific combination: a VAT-registered business issuing a document that presents itself as a VAT invoice, with tax lines, without GRA clearance. A plain invoice or sales receipt making no VAT claim is lawful. So documents are labelled "Invoice" or "Receipt", the tax engine ships built but disabled, and **nullable clearance columns and a clearance hook are left in place** — `clearance_number`, `signature`, `qr`, `cleared_at`. They cost nothing now and mean certification later is a code path rather than a migration across issued documents.

**Invoices are delivered through the messaging adapter (ADR 0005), never a direct provider call**, over WhatsApp and SMS, carrying a **link** rather than the document. A link fits inside a WhatsApp template's constraints and keeps the document behind authorisation — which means an invoice needs a signed, expiring URL, and that is a design item rather than a field.

## Consequences

**Positive:** the catalogue makes ADR 0031's per-SKU deals actually usable, and gives the SME repeat-item reporting for free. The draft accumulator is a genuinely small mechanism for two rules that looked contradictory. Snapshotting price, tax name and tax percentage means no historical document ever restates itself, which is the property that makes the records trustworthy. And leaving the clearance seam in now is the difference between certification being a feature and being a data migration.

**Negative / cost:** this is a large amount of new surface — catalogue, media library with lifecycle, invoices with numbering and immutability, credit notes, a composable tax engine — on an MVP with no feature code written. The schedule needs re-cutting rather than absorbing it, and `product-spec.md` §13 row 2's warning becomes more pointed, not less. Images add an **object storage dependency** this project does not have: a provider, a region matching the web/api/database constraint, an upload path, size limits enforced at upload, and resized derivatives. Gapless numbering is a concurrency problem, not a counter — two simultaneous issues must not collide or skip.

**And the tax position is a real, accepted risk.** The safeguards above make the shipped product lawful for a non-VAT-registered SME. They do not make it lawful for a VAT-registered one, and nothing in the software prevents such a business from using it and believing the output is a valid invoice. That gap belongs in the pilot agreement and in onboarding, and E-VAT certification is now a blocking checklist item before any VAT-labelled document ships.

**Rejected alternatives:**

- *No catalogue: free-text item name and value on the deal.* What was first recommended, and it keeps scope. Overruled by the product owner, who wants products and images visible on the deal and invoice.
- *One image per product, no library.* Smaller and safer for the performance budget. Overruled; reuse across products was explicitly wanted.
- *Invoice per won deal, no consolidation.* Simpler. Rejected because a customer buying three SKUs would receive three invoices.
- *Period-based batch invoicing.* Matches "same period, same invoice" literally. Rejected because a scheduled close cannot know whether a rep is mid-negotiation.
- *A single tax percentage per product.* Simplest. Rejected because Ghana stacks levies and a legislative change would then mean editing the whole catalogue.
- *Ship VAT-labelled invoices with tax on by default.* What the owner's instruction could be read as permitting. Not adopted: the risk lands on the customer, in criminal form, and that is not a risk to accept on their behalf by default. Available on an explicit, recorded instruction.
- *Defer invoicing until certification.* The conservative option, and it leaves the SME on paper for the thing they most want. The labelling and tax-off safeguards give most of the value lawfully.

## Enforcement

- New invariants: an issued invoice is immutable; invoice numbering is gapless per workspace; a deal and its invoice line carry snapshotted name, unit price and tax components; a media asset cannot be hard-deleted while referenced.
- **G9** is the guard on the media library — list views must load only primary derivatives, and the budget is the test.
- The clearance columns exist from the first migration, so no future certification work migrates issued documents.
- Object storage needs its own ADR before the first upload path is written: provider, region, size ceiling, derivative strategy.
- `product-spec.md` §13 carries this as a dated scope amendment, and the pre-development checklist gains E-VAT certification as a blocking item.
