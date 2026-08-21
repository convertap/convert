# ADR 0035 - A platform admin crosses tenancy only by an audited action

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

ADR 0034 gave the split fee a platform-wide default set by "the administrator of the system" — meaning Convert's own staff, not an SME owner. The product owner then named the consequence directly: that needs another application for administrators, and a separate public-facing one.

The administrator surface is the part that matters, because it introduces an actor this architecture has no room for. ADR 0002 makes row-level security on the tenant key *the* tenancy boundary. **I1 says no cross-tenant foreign key ever resolves.** ADR 0003's principal model has three kinds — `UserPrincipal`, `ClientPrincipal`, `SystemPrincipal` — and none of them may see another tenant's rows.

A Convert staff member who can inspect any workspace is, by definition, an actor that crosses that boundary. Added carelessly, it is the single change that would falsify the product's core promise: `HANDOFF.md` §4 already records tenant isolation as a Risk with impact "ends the project", and that is not hyperbole for a product whose pitch is that an SME's customer list is its own.

The `public-facing` half turned out to be simpler than it sounded. The product owner clarified it means a **marketing website**, not the customer-facing invoice pages.

## Decision

**A fourth principal, `PlatformAdminPrincipal`, with no ambient cross-tenant access.** The distinction is the whole decision. A platform admin does not hold a key to every workspace; they hold the ability to *request* access to one, for a stated reason, and that request is a recorded event.

Concretely:

- A **separate database role** for platform administration, distinct from the application role. The application role remains subject to RLS and cannot bypass it — which is the fix `HANDOFF.md` §4 already demands and which G7 must grow a second assertion for.
- **No default cross-tenant read.** Access is scoped to an explicit support action against one named workspace, time-bounded, and it expires.
- **Every cross-tenant access writes to `audit_event` with a reason**, the admin's identity, and the workspace touched. `architecture.md` §6 already defines `audit_event` as the home for system-level actions distinct from the sales timeline reps read.
- **I1 is restated**, not weakened: *no cross-tenant access except an audited platform-admin action*. The exception is named in the invariant rather than living as an undocumented capability, because an unnamed exception is how a boundary quietly stops existing.

**`apps/admin` is deferred until there is something to administer.** The split fee alone does not justify an application, and an unfinished admin surface holding cross-tenant reach is a liability rather than a feature. When it lands it goes in the monorepo, imports `@convert/contracts` **only** — exactly like `apps/web`, so G1 keeps domain logic out of the browser bundle — and shares the existing API rather than getting its own.

**The marketing website lives outside this repository.** A static site elsewhere costs nothing, and keeping it out means it never competes for the performance budget G9 measures or appears in the deploy matrix.

**The customer-facing invoice and payment pages are not a separate application.** They are unauthenticated routes inside `apps/web`, reached by the signed expiring link of ADR 0034, sharing the design system and the same-region deployment. Splitting them out would double the LCP surface for nothing.

## Consequences

**Positive:** the cross-tenant capability exists on the record, with a named exception and an audit trail, rather than as an accidental superuser. Deferring `apps/admin` keeps the deployment footprint at three services per environment and avoids shipping a half-built surface with the widest reach in the system. Keeping the marketing site out and the invoice pages in is the arrangement that costs least on both counts. And forcing the separate database role now aligns with the RLS fix that was already outstanding, so the two land together instead of one undoing the other.

**Negative / cost:** I1 is no longer absolute, and "absolute" was easy to reason about. Every future reader must understand the exception, and every support tool built on it is a place the exception could widen. Time-bounded scoped access is more work than a staff flag on a user row, and the temptation to add that flag will recur. The audit trail is only as good as the reason field, which is free text a hurried person will fill with a full stop. And when `apps/admin` does arrive it brings two more Railway services across two environments, in `ams`, plus its own G9 budget.

**Rejected alternatives:**

- *A staff boolean on the user record, bypassing RLS.* What almost every product does, and the reason breach post-mortems read the way they do. Rejected: it is ambient, permanent, invisible, and unauditable.
- *Platform admins query the database directly, with no admin app.* Tempting while the product is small, and it means support work leaves no trace at all. Rejected for the same reason, plus it makes the capability impossible to revoke.
- *Build `apps/admin` now.* The owner's instruction, read literally. Deferred rather than rejected: there is one setting to administer, and the cost of an incomplete cross-tenant surface exceeds the benefit until there is real support work to do.
- *The marketing site inside the monorepo.* Convenient for shared tokens. Rejected because it would enter the deploy matrix and the performance budget for content that changes on a different cadence entirely.
- *A separate application for customer invoice pages.* Cleaner isolation of unauthenticated traffic. Rejected as a second front-end to maintain and measure for two routes.

## Enforcement

- **I1** rewritten to name the exception: no cross-tenant access except an audited platform-admin action.
- **G7** grows the assertion `HANDOFF.md` §4 already calls for — connect as the *application* role, attempt a cross-tenant read, require nothing back. That is what proves the application role cannot do what the platform admin role can.
- A new invariant: every cross-tenant read by a platform admin produces an `audit_event` row. Untested code paths here are indistinguishable from a backdoor.
- `.boundaries.json` gains `apps/admin` restricted to `@convert/contracts` when the application is created, which requires an ADR in the same commit under G2.
