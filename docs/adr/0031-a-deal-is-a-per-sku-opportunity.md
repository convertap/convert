# ADR 0031 - A deal is a per-SKU opportunity, and a lead may have many

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

Checklist **R2** (lead-to-deal cardinality, and what creates a deal) and **R8** (lead statuses versus deal stages) were the two decisions holding the schema shut. `packages/infra/src/db/schema.ts` deliberately held only the tenant table because guessing these means building `contact`, `lead` and `deal` twice.

The drafted invariants contained a contradiction that had to be resolved either way. **I3** said "a lead converts to at most one deal". **I5** said a Won or Lost deal is terminal and "reopening creates a new deal, preserving history". Reopen a lost deal and the lead has two. Both could not stand.

The product owner's model resolved it from an unexpected direction: **a deal corresponds to one SKU**. An advertisement brings in a lead interested in a product or service; that lead may buy several items, and each is won or lost on its own. A customer can take the fridge and decline the warranty.

That reading was checked against `mvp-scope.md:196–210`, which defines deals as pipeline objects in its own words — "Enter **estimated** deal value", "**Move deals between stages**", "View deals using a **Kanban pipeline**", "**Mark deals as won**". The alternative reading, that a deal *records a completed purchase*, would make every deal born Won: nothing to forecast, nothing to move, an empty Kanban, and "estimated value" meaningless. The per-SKU-opportunity reading preserves everything scope specifies and is strictly more expressive.

## Decision

**A deal is an opportunity for one SKU.** It carries its own value, moves through the pipeline independently, and is won or lost on its own.

**A lead may have many deals, and at most one *open* deal per SKU.** This replaces I3, and it is what resolves the contradiction with I5: a deal lost and later revisited becomes a *new* deal for the same SKU, because the previous one is terminal.

**A deal is created by an explicit rep action at Qualified**, not automatically on status change. Auto-creation produces zero-value deals for every lead that ever reaches Qualified, which distorts conversion and pipeline-value reporting past the point of usefulness. A lead may therefore sit at Qualified with no deal, which is a real and acceptable state.

**A converted lead's deal enters the pipeline at `Qualified`**, not at `New`. The lead already earned that judgement; re-walking `New` and `Contacted` is busywork that inflates every time-in-pipeline metric. Deal stages `New` and `Contacted` remain meaningful only for deals created outside the lead flow.

**`lead.status = Converted` requires at least one linked deal** — I4, in the "at least one" form, since a lead may now yield several.

**A lost lead requires no reason.** The product owner made `lost_reason` optional. I4's requirement is relaxed accordingly: the field exists and is prompted for, and a rep may decline. A mandatory field on a "did not buy" action gets satisfied with a keystroke, which produces reporting that looks complete and means nothing.

**`Lost` is terminal for a lead.** A customer who returns generates a **new** lead against the same contact. Leads are per-opportunity records, which keeps them consistent with deals being per-SKU and with I5's philosophy.

**A second lead for the same contact is a new opportunity, not a duplicate.** No automatic deduplication of leads. A second lead from the same contact *and the same source* within 24 hours is **flagged** as a possible duplicate for a human to judge. Merging leads automatically destroys source attribution, which is the one thing the campaign reporting depends on.

**A lead may reference the products it came in for** — optional, and many. Optional because a walk-in specifies nothing; many because one enquiry can span items. This is the advertisement-attribution path: the lead's source plus the products it arrived for.

## Consequences

**Positive:** the I3/I5 contradiction is gone rather than papered over. Per-SKU deals give genuinely better reporting than a single blended opportunity — which product sells, which is declined, and at what value — and that is the raw material for the campaign analytics the deck promises. Explicit creation keeps pipeline value honest. Terminal `Lost` plus new-lead-on-return keeps every record immutable in the way I5 and I6 already require.

**Negative / cost:** a lead with five SKUs produces five deals, so the Kanban holds more cards than a one-deal-per-lead model and the pipeline view has to group by lead or it becomes unreadable on a phone — which is a real mobile-first design constraint, not a detail. Rep effort rises: five deals to move rather than one. The 24-hour duplicate flag is a heuristic and will produce both false positives and misses; it is deliberately advisory, never automatic. And a lead sitting at Qualified with no deal is a state that looks like a bug in a report until someone explains it.

**Rejected alternatives:**

- *A deal records a completed purchase.* The literal reading of the owner's first phrasing. Rejected because it empties the pipeline, contradicts `mvp-scope.md:196–210`, and collapses the two state machines the scope deliberately split — recorded as a divergence in `product-spec.md` §13 rather than silently dropped.
- *One deal per lead, with line items inside it.* The conventional CRM shape, and it keeps the Kanban small. Rejected because a line item cannot be won or lost independently, which is exactly the distinction the owner wants and which the fridge-and-warranty case needs.
- *Auto-create the deal on reaching Qualified.* Nothing gets forgotten. Rejected on metric integrity: an auto-created deal with a null value counts as pipeline that nobody intends.
- *Deal enters at `New`.* Uniform stage history and a fully measurable funnel. Rejected because it makes reps repeat qualification they have already done, and inflates time-in-pipeline for every converted lead.
- *Mandatory lost reason.* Better reporting in theory. Overruled by the product owner, and the rejection is sound: a forced field produces "not interested" a thousand times.
- *Revivable lost leads.* Fewer records. Rejected because it makes lead history mutable and destroys the count of distinct opportunities, which is the number an SME actually wants.

## Enforcement

- **I3**, rewritten: a lead may have many deals, at most one *open* per SKU.
- **I4**, rewritten: `Converted` requires at least one linked deal; `lost_reason` is optional.
- **I5** unchanged — deal outcomes stay terminal, and now agree with I3.
- A new invariant that `Lost` is terminal for a lead, so a returning customer produces a new lead.
- The two state machines stay distinct, as `CLAUDE.md` requires: lead status `New → Contacted → Qualified → Converted → Lost` is not the deal pipeline `New → Contacted → Qualified → Proposal → Won/Lost`.
