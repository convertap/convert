# ADR 0030 - The workspace is the tenant, and a contact is identified within it

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

Checklist **A2** (does a user belong to one organization or many), **A4** (tenancy model) and **R1** (phone number as contact identity) all describe the same boundary from different sides: what a tenant *is*, who may cross into it, and how a person is identified inside it. They were answered together in the product-owner session of 21 August because answering one without the others produces a schema that contradicts itself.

Three facts shaped it.

**The product owner distinguishes an account from a workspace.** One person may own several SMEs and wants them separate. `mvp-scope.md` already uses both words loosely — `:93` "Create business account" then `:94` "Create organization/workspace" — so the distinction is a sharpening of existing language, not a new concept.

**A contact may exist in more than one workspace, and must not be one row.** Two SMEs legitimately serve the same customer. ADR 0002 makes row-level security on the tenant key *the* tenancy boundary, and I1 says no cross-tenant foreign key ever resolves. A genuinely shared contact row would break both, and the security model is the product's core promise.

**Phone identity is now load-bearing twice.** ADR 0029 made a phone number an authentication identifier. R1 makes it contact identity. If the two normalise differently, a rep's login number and their record in a colleague's contact list are different strings for the same human.

## Decision

**The workspace is the tenant, and the only tenancy boundary.** `organization` is renamed to `workspace` throughout — schema, contracts, RLS policies, documentation. Every tenant-owned row carries `workspace_id`, and I1 is restated in those terms.

**There is no `account` entity in the MVP.** ADR 0029 gives a person one identity that may hold membership in many workspaces, and that alone delivers "I own three SMEs and switch between them" — the switcher comes from membership, not from a parent row. With subscriptions attached per workspace, an account table would hold no billing, grant no access, and own no data. It arrives when billing needs a payer spanning workspaces, which is when it earns its keep.

**A user belongs to many workspaces** (A2), through `workspace_member` carrying the role. Identity is global; membership is per tenant.

**Contacts are copied across workspaces, never shared.** The same human in two workspaces is two rows with two histories. Uniqueness is scoped to the workspace, never global — a global constraint would also leak one tenant's data through the other's error message.

**Contact identity, concretely** (R1):

- A contact requires **at least one** of phone or email, and neither individually. A walk-in who gives only a name and a number, and a referral who gives only an email, are both capturable. Messaging features are unavailable on a contact with no phone rather than the contact being unrecordable.
- Phone numbers normalise to **E.164** on write, storing the raw input alongside for support. This is the same normalisation ADR 0029 applies to user identifiers, deliberately: one definition of "same number" everywhere.
- A contact may hold **several phone numbers**, in `contact_phone`, each unique within the workspace, exactly one flagged primary. Multi-SIM is normal in Ghana — a customer may take calls on one network and use WhatsApp on another. **Every stored number is matchable for inbound messages**, not only the primary, because a single column silently creates a duplicate contact the first time someone messages from their other SIM.
- A collision on any stored number **surfaces a merge prompt, never a validation error**. A rep who is blocked invents `+233…1` variants, and then the data is dirty *and* the rep is annoyed. This is I2.
- The same number may exist as **both a user and a contact**. They are separate namespaces with no cross-constraint: a shop owner may be a customer, and a rep's number will sit in a colleague's contact list. A constraint here produces a baffling error while adding a genuine customer.

## Consequences

**Positive:** one boundary to reason about — tenancy, entitlement (A5) and RLS all key on the same column, so there is no second scope to keep in step. Copied contacts keep I1 absolute, which keeps the security argument simple enough to be true. Sharing one normalisation rule between auth and contacts removes a class of bug that would otherwise appear only in production, on a rep who is also a customer. Dropping `account` removes a table, a join and a migration from the MVP.

**Negative / cost:** the rename touches everything that currently says `organization` — schema, `TENANT_TABLES`, `.boundaries.json` if it names paths, every ADR that cites the old term, and the Notion mirror. Cheap now, with one table and no migrations; it would be expensive later, which is why it happens now rather than after the first tenant table. Copied contacts mean a customer's history does not follow them between workspaces, which will read as a missing feature to an owner running two SMEs — and it is the correct trade, since the alternative is cross-tenant reads. `contact_phone` is a join for the commonest lookup in the product (match an inbound message to a contact), so it needs the index and it will need watching against the performance budget.

**Rejected alternatives:**

- *Keep `organization`.* Less churn today. Rejected because the product owner's model is a workspace, `mvp-scope.md` already says "organization/workspace", and a name that disagrees with how people talk about the system decays into two vocabularies.
- *An `account` entity now, for future billing.* Cheap-looking, and it invites premature use — code starts scoping to the account "because it's there", which is precisely the second boundary this decision avoids.
- *Contacts shared across workspaces in one row.* What the owner first described. Rejected because it contradicts ADR 0002 and I1 outright, and the tenancy model is not worth trading for a convenience.
- *One phone column on `contact`.* Simpler schema, and it breaks inbound matching for anyone with two SIMs — the exact failure the product exists to prevent.
- *Global phone uniqueness.* Would let the product recognise a customer across SMEs. Rejected on both tenancy and privacy: it tells one SME that another has this customer.

## Enforcement

- **I1** restated on `workspace_id`, with the RLS assertion in G7 extended to prove the *connecting role is subject to* the policy, not merely that it is enabled. That second assertion is already outstanding in `HANDOFF.md` §4 and lands with the first tenant table.
- **I2** covers `(workspace_id, phone_e164)` uniqueness across `contact_phone` and the merge-prompt behaviour.
- A new invariant covering "a contact has at least one of phone or email", mirroring the user-identity rule from ADR 0029.
- G1 keeps the layering honest; the rename is mechanical and belongs in its own pull request so the diff is reviewable.
