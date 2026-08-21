# ADR 0029 - Authenticate with a one-time code, over a verification port, with Fabric behind it

**Status:** Accepted
**Date:** 2026-08-20
**Supersedes:** -
**Superseded by:** 0047, in one part only — the refresh token lifetime, now 7 days

## Context

Checklist **A1** — the login method — has blocked implementation since the checklist was written, because it decides the identity model, the invite flow (A3), and whether login depends on an external party's calendar.

The constraint that rules out the obvious answer is in checklist §4: **reps are phone-first and many have no working email.** An email-only product cannot onboard the people who use it. Equally, phone-only would exclude the SME owners who do have email and expect to use it. So identity has to accept either.

Two hosted providers were evaluated against that requirement before deciding to build.

**WorkOS cannot do it.** Its API reference is unambiguous: `POST /user_management/users` requires `email`, the User object exposes `email` and `email_verified` and **has no phone field at all**, and both the password and Magic Auth grants require `email`. SMS exists only via `/auth/factors/enroll` type `sms`, described as "the additional authentication method used *on top of* the existing authentication strategy", and AuthKit's SMS challenge takes a `pending_authentication_token` — a step-up after primary authentication. A phone-only user cannot exist in WorkOS.

**Clerk can do it, but not on terms that suit this product.** Phone is a first-class identifier (`phoneNumber` in E.164), `signIn(identifier)` accepts email, phone or username, and `phone_code` is SMS OTP as a first-factor strategy. Against that:

- SMS in production **requires a paid plan**; the free tier excludes SMS codes.
- The SMS allowlist **defaults to the US and Canada only**, and users from disabled countries "cannot receive OTPs or notifications, nor can they sign up or update their profiles with those phone numbers". Ghana must be explicitly enabled, and the documentation describes the mechanism without listing available countries — so the product's ability to authenticate anyone at all would rest on an unverified dashboard setting.
- Ghana SMS is priced as "international: market rate" — unquoted, and charged on **every** login under the rule below.
- Password is an **instance-level** strategy, so "phone always uses a code" cannot be expressed in configuration; enabling passwords at all would let a phone user bypass the code. Enforcing the rule would mean our own custom flow — our code carrying the security property, with a silent bypass as the failure mode.
- It introduces a United States sub-processor holding every rep's phone number, which must then appear in the L2 controller/processor terms and be reconciled with the L3 consent model and Act 843.

**The product owner set one rule:** any use of a phone number requires a one-time code — at signup and at every login, without exception.

**And Fabric already provides exactly that primitive.** Fabric is our own messaging product, and it offers **OTP verification as a service**, channelled over email, SMS or WhatsApp. So the code lifecycle — generation, delivery, expiry, checking — is not something this codebase needs to build or store. One primitive covers all three channels, which means the phone rule and the email path can share a single mechanism instead of being two subsystems.

That reframes A1. The question is no longer "which auth vendor" but "what is our identity model, and what does it depend on".

## Decision

**Identity accepts either channel.** A user carries a nullable `email` and a nullable `phone_e164`, with a constraint that at least one is present, and a unique index on each where present. Phone numbers normalise to E.164 on write, sharing the rule R1 sets for `contact` — one normalisation, one definition of "same number", everywhere in the product.

**Authentication is passwordless. The credential is always a one-time code.** There is no password column, no strength rule, no reset flow, and nothing to leak. This satisfies the owner's phone rule by construction rather than by guard: there is no alternative path a phone user could take. Email accounts use the same mechanism over the email channel, so the product has one login story rather than two.

**Verification is a port, and Fabric is an implementation of it.** A `VerificationPort` exposing *start* and *check* lives in the application layer, separate from the messaging port of ADR 0005 — sending a marketing message and proving control of an identifier are different capabilities with different failure modes, and collapsing them would put auth behind the campaign code path. Nothing outside `packages/infra` may reference Fabric directly. Auth depends on the port.

**Channel follows the identifier, with SMS first for phone.** An email identifier verifies over email. A phone identifier verifies over SMS on day one, and over WhatsApp once an authentication-category template is approved (E4) — WhatsApp is cheaper and near-universal among Ghanaian SMEs, but it is gated on Meta approval that does not exist yet, and login is not the place to wait for it.

**Sessions are long-lived, because a login costs money.** A short-lived access token (15 minutes) sits in front of a rotating refresh token valid for 30 days. Under a code-per-login rule, session lifetime *is* the per-user messaging bill: a 24-hour session would mean roughly twenty-two codes per user per month, a 30-day refresh means about one. Rotation on refresh bounds the value of a stolen token.

**Our API rate-limits verification independently of Fabric.** An unauthenticated "send me a code" endpoint spends real money per call. Limits apply per identifier and per IP, a resend inside the live window returns the existing verification rather than minting another, and a daily cap per identifier is enforced. This is not delegated: the spend is ours whatever the provider does.

## Consequences

**Positive:** a rep with no email can register, and an SME owner with email is not forced onto a phone. No third-party processor holds rep contact details, so L2 and L3 stay simple and Act 843 exposure does not grow. No passwords exist to store, reset, or breach. One verification primitive serves three channels. The port keeps the decision reversible — swapping Fabric for an aggregator or a hosted verifier is an infra change, not an auth rewrite — and it is also the failover mechanism, since a second implementation can be configured behind the same interface.

**Negative / cost:** **Fabric now gates the front door.** Marketing messages failing is an annoyance; verification failing means nobody can log in, by any channel, at once — and Fabric is a young product of our own, so this is a self-inflicted single point of failure on the most critical path in the system. Nothing in this record removes that; the port makes a second provider *possible*, and configuring one is real work that has not been done. Relatedly, the open question about Fabric — whether it holds its own Meta Solution Provider status or wraps Cloud API — was a marketing-timeline concern and is now an **authentication** blocker, which raises its priority above everything else on the checklist.

Passwordless means possession of the SIM or the mailbox *is* the credential, so a SIM swap is a full account takeover with no second factor behind it. For a pilot holding SME contact lists that is proportionate; it stops being proportionate when the product holds anything of monetary value, and the answer then is a second factor, not a password.

Every login costs a message, forever, as a recurring per-seat cost against GHS 150/month tiers. The 30-day session is what keeps that near one message per user per month, which makes session lifetime a cost decision that must not be shortened casually.

**Rejected alternatives:**

- *WorkOS.* Cannot represent a phone-only user, on the evidence above. Not a matter of configuration.
- *Clerk.* Capable, but its Ghana SMS availability is unverified and load-bearing, its Ghana pricing is unquoted while being charged per login, its instance-wide password setting cannot express the owner's rule, and it adds a US sub-processor holding rep phone numbers. Any one of those is survivable; together they cost more than they save.
- *Phone plus password.* Contradicts the owner's rule directly, and leaves a phone-only user with no self-serve recovery channel.
- *Email with a password, phone with a code.* Tempting, because a password gives a Fabric-independent way in and answers the single-point-of-failure objection. Rejected because it reintroduces password storage and reset for a minority of users, splits the login story in two, and — since Fabric verifies email as well — only helps if we also run our own mail path. Worth revisiting as the break-glass if Fabric proves unreliable.
- *Building the OTP lifecycle ourselves.* Rebuilds what Fabric already provides, and adds code stores, expiry sweeps and a delivery integration to own. The port means we can still do this later without touching auth.
- *Magic links.* Fewer digits to mistype, but a link is awkward over SMS, breaks when opened in a different browser, and is worse on WhatsApp where the authentication template rules restrict what a message may contain.

## Enforcement

Three mechanisms, none of which exist yet, and all of which land with the auth module:

- **A forbidden-external rule** in `.boundaries.json`, so no layer above `packages/infra` may import a Fabric client. Gate G1 then fails the build if auth reaches past the port. Adding that rule is authorised by this record.
- **An invariant test** that a user row satisfies "at least one identifier present" and that both identifiers are unique per non-null value, alongside I1–I12.
- **A test that no password field exists** on the user model — the cheapest way to keep a well-meaning future change from reintroducing the bypass this decision removes by construction.

Until the auth module exists, this record is a decision and nothing more; the schema still holds `organization` and nothing else.
