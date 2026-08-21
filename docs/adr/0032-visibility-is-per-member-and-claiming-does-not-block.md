# ADR 0032 - Visibility is granted per member, and claiming a lead does not wait for approval

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

Checklist **R3** is not a permissions feature. It decides whether every list query in the data-access layer carries an owner predicate, and `architecture.md` §7 says plainly that retrofitting it later is a rewrite. **R4** — what happens to a deactivated rep's records — hangs off the same answer.

The scope documents are not neutral here. `mvp-scope.md:81` names *"limited visibility into what sales representatives are doing"* as a problem the product exists to solve, and `:106` scopes a Sales Representative to **assigned** leads, deals and follow-ups. So an owner seeing everything is a requirement, and a rep seeing only their own work is the documented default.

Two further things came out of the session that the checklist had not anticipated: leads may be **unassigned** — inbound WhatsApp capture has no natural owner — and the product owner wants reps able to **claim** from that pool, with the owner able to approve.

## Decision

**A rep sees their own records plus everything unassigned. An owner sees everything.** The unassigned pool is a shared queue, visible to every member, because a lead nobody can see is a lead nobody works — and inbound capture lands there by default.

The visibility predicate is therefore, for every tenant list query:

```
workspace_id = :workspace
AND (role = Owner OR member.can_view_all_leads OR owner_id = :member OR owner_id IS NULL)
```

**Widening visibility is a per-member grant, not a workspace-wide switch.** `workspace_member.can_view_all_leads`, granted by an owner. The reason is that "unforeseen circumstances" is nearly always one person covering one absence, and a global flag opens the entire business to everyone to solve a one-person problem — then nobody turns it off. Per-member costs the same to implement, is auditable (who granted it, when, to whom), and revokes cleanly. A workspace-wide open-pipeline toggle stays available later for a business that genuinely wants one; it is a column and a clause, not a redesign.

**A rep claims an unassigned lead and starts work immediately. Approval follows; it does not gate.** The owner is notified and may reassign or revoke. The claim is **atomic — first claim wins** — so two reps cannot both start on the same lead.

This is the one place the decision deliberately departs from the owner's first phrasing, and it was accepted after the trade-off was put: the product's entire value is following up fast, and a blocking approval means a hot WhatsApp lead sits untouched while the owner sleeps. That is the exact failure `mvp-scope.md` frames the product as solving. A workspace setting to require approval, **defaulting to off**, is available for a business that wants the ceremony.

**Deactivating a member never orphans records** (I7), but reassignment is no longer forced in the same transaction. The owner sees the deactivated member's records and may hand them to a named rep, **or let them fall back to the unassigned queue** — which is now a legal, visible, workable state. I7's real requirement is "never orphaned", and the queue satisfies it.

**Deal ownership defaults to the lead's owner and moves independently thereafter**, because the person who qualifies is not always the person who closes.

## Consequences

**Positive:** the base rule matches the documented rep role, so no query has to be rewritten later. The unassigned queue turns inbound capture from a routing problem into a visible work list, and claiming makes distribution self-service rather than an owner bottleneck. Per-member grants mean a temporary need does not become a permanent hole. Offboarding stops requiring N assignment decisions before an owner can deactivate someone who left this morning.

**Negative / cost:** every tenant list query carries a four-clause predicate, and both branches need testing — the rep path and the widened path — for every entity. The `owner_id IS NULL` term means an unassigned record is visible to everyone in the workspace, so a sensitive inbound enquiry is briefly readable by all members; that is the price of it being workable at all, and it stops the moment someone claims it. Optimistic claiming means an owner can be surprised by who is working what, which is a notification design problem rather than a data one. And a per-member grant is one more thing to review during an access audit.

**Rejected alternatives:**

- *Everyone in the workspace sees everything.* Simplest data layer — RLS alone would suffice. Rejected because `:106` scopes a rep to assigned records, and restricting later touches every query.
- *Rep sees own only, no widening at all.* One predicate, strongest privacy. Rejected because no rep could cover for an absent colleague without a formal reassignment, which is friction on the commonest real event.
- *A workspace-wide open-pipeline toggle.* What was first proposed. Rejected in favour of per-member for the reasons above; kept as a future option.
- *Blocking owner approval on a claim.* The owner's first phrasing. Overruled after discussion because it puts a human in the latency path of the product's core promise. Preserved as an opt-in workspace setting.
- *Mandatory reassignment on deactivation, as I7 originally required.* Guarantees an owner, at the cost of blocking offboarding. The queue achieves the same guarantee without the block.

## Enforcement

- **I7**, rewritten: deactivation never orphans a record; it either reassigns to a named member or returns the record to the unassigned queue.
- A new invariant on the visibility predicate itself — a list query for a member without `can_view_all_leads` returns only their own records plus unassigned ones. This is the invariant most worth having a real integration test behind, because it is enforced in application code above the RLS boundary and G7 cannot see it.
- A new invariant that a claim is atomic: concurrent claims on one lead resolve to exactly one owner.
- Every grant and revocation of `can_view_all_leads` writes to `audit_event`, which `architecture.md` §6 already defines as the place for role changes.
