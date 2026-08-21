# ADR 0047 - Sessions are stored, revocable, and identity-only

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** 0029, in one part only — the refresh token lifetime
**Superseded by:** 0050, in two parts only — `IDENTITY_TABLES`, replaced by one registry classified by the access control the gate demands; and the `verification_attempt` access mechanism, whose "grant of insert plus select restricted to the identifier presented" describes something Postgres grants cannot do. Everything else here stands, including that `session` carries a policy keyed on `app.current_user` and that identity tables never join the workspace-scoped class

## Context

ADR 0029 settled how someone proves who they are: passwordless, a one-time code over a
`VerificationPort`, email or phone, a 15-minute access token in front of a rotating refresh token.
It did not settle whether the refresh token exists as a row.

That gap matters more here than it would in most products. There is no password behind the
credential, by design — possession of the SIM or the mailbox *is* the credential. So a stolen
handset is a full account takeover for as long as the refresh token lives, and the only defence
available is taking the token away.

Three things already written down constrain the answer:

- **`architecture.md` §16 promises "server-side revocation on member deactivation."** No stateless
  design can keep that promise. As it turns out the promise is also worded wrongly, for the reason
  in the next point.
- **ADR 0030 makes identity global and membership per tenant**: a user belongs to many workspaces
  through `workspace_member`, which carries the role. So "what is a session scoped to" is a schema
  question with two real answers, not a detail.
- **ADR 0013 puts the session in the web BFF.** The browser holds a cookie; the API is reached
  server-side. Concurrency is therefore between BFF instances rather than between browser tabs,
  which changes the shape of the rotation race but does not remove it.

ADR 0029 also requires rate limiting on the code-sending endpoint — per identifier, per IP, and a
daily cap — and that endpoint is unauthenticated and spends real money per call. A limit held in
process memory resets on deploy and is not shared between API instances, so it is not a limit; it is
a per-instance suggestion whose failure mode is a bill.

There is no Redis in this stack, and its absence is deliberate: ADR 0010 chose Postgres for the job
queue over a broker, at far higher write volume than counters like these.

## Decision

**The refresh token is a row.** A `session` table holds one row per live token family, storing a
hash of the secret and never the secret. Sign-out, replay detection and a lost handset all become
one DELETE. This is the whole reason to prefer stored: a 7-day window during which nobody — not the
person, not support — can end a session is not a window worth having on a device whose only
credential is being held.

**A session is identity-only. It never carries a workspace or a role.** Membership, role and
`can_view_all_leads` are read from `workspace_member` on every request, and `app.current_workspace`
is set from a membership that was just checked rather than from a claim. The alternative — binding
the session to a workspace so the token carries the role — puts authorization facts inside a
credential, where a role downgrade or a deactivation only takes effect when the credential expires.
That is the same revocation lag this record exists to remove, reintroduced one layer up. The
per-request read is not a new cost: §7's list predicate needs `can_view_all_leads` anyway.

**The access token stays a 15-minute JWT.** An opaque handle looked up per request would make
identity revocation immediate rather than bounded, but it buys less than it appears to, because
deactivation is already immediate through the membership read — the token is not the gate for
authorization, only for identity. Against that it puts the hot path onto a table that rotation
writes to constantly. Stated plainly as the residual: **after a remote sign-out, a stolen handset
keeps working for up to 15 minutes.** The cost side is a signing key in Infisical and a `kid`
rotation plan, neither of which exists.

**The refresh token is `<user_id>.<session_id>.<generation>.<secret>`, and the row stores the
current generation alongside the hash of the current secret.** Presenting any generation below the
current one is a replay, and a replay revokes the entire family rather than the presented token.
Rotation only protects anything if replay is *detected*: a row whose hash is simply overwritten
cannot tell a replayed old token from a random string, so a thief who loses the race is merely asked
to try again. A chain table with a row per token detects it properly and costs roughly 670 rows per
session-week, unprunable, since pruning destroys the history that was the point of keeping it. The
generation counter gets the same detection at one row per session.

**The refresh lifetime is 7 days, absolute from session creation. This supersedes the 30 days in
ADR 0029, and nothing else in it.** ADR 0029 chose 30 days as a cost decision and said session
lifetime "must not be shortened casually", so the arithmetic belongs in this record rather than in a
commit message: at a code per login, 30 days is about one message per user per month and 7 days is
about 4.3, so **verification spend is roughly 4.3× what ADR 0029 budgeted**, recurring, against
GHS 150/month tiers. It was shortened anyway, deliberately, because the other side of the same
number is how long a lost handset that nobody reports stays usable. Sliding expiry — each rotation
extending the window — was rejected twice over: it produces a credential that never expires on a
device with no password behind it, and it would put actual spend near zero while ADR 0029's stated
model says one message per user per month, so the record and the invoice would disagree.

**Rotation serialises on the session row with `SELECT … FOR UPDATE`, and a grace window measured in
seconds serves generation N−1 the current secret instead of revoking the family.** Two BFF instances
refreshing the same session concurrently otherwise produce exactly the condition replay detection
punishes, and the punishment lands on a device the person is actively holding. The lock removes the
overlap for nearly all of them; the grace window covers a transaction that began before the winner
committed. Every use of the grace window writes an `audit_event`, because if it fires often the BFF's
refresh logic is wrong and the log is the only place that would show it. The cost, said out loud: a
thief presenting N−1 inside that window is handed the current secret. It is a narrower cost than
signing real users out at random, which teaches them the product cannot be trusted.

**A revoked family tells the person in the application, never by SMS or WhatsApp.** On most products
an out-of-band message on a security event is right. Here the message channel *is* the login
channel and costs money per send, so an attacker who can trigger revocation can trigger spend. The
`audit_event` is what an investigation reads; an in-app notice at next sign-in is what the person
reads, and it arrives while they are already looking.

**`session` carries row-level security keyed on a second session variable, `app.current_user`.**
Identity tables sit outside the workspace boundary, which would otherwise leave a forgotten
`WHERE user_id` back to being a leak rather than an empty result — the exact class of mistake ADR
0002 and ADR 0042 exist to convert into nothing. The lookup that establishes who the user is cannot
satisfy such a policy by ordinary means, since knowing the user is its output rather than its input;
this is why the user id rides in the token. The GUC is set from that claim *before* the lookup, which
is safe because a policy can only narrow what a query sees and the presented secret still has to
hash-match. A forged user id buys a scoped view of rows the holder cannot authenticate against.

**That argument only holds under two conditions, so both are part of the decision.** First, the setting is transaction-scoped: `BEGIN` then `SET LOCAL app.current_user`, never a bare `SET`. The api runs on a connection pool, and a plain `SET` outlives the request — so a forged id from a refresh attempt that failed would still be the current identity for whatever request next borrows that connection, which converts a narrowing policy into an attacker-chosen one. Second, the session lookup is the *only* identity-table statement permitted before the secret hash-matches. Any other read or write in that window runs under an identity nobody has proven, and the narrowing argument says nothing about a statement whose results the attacker gets to keep. Both conditions are properties of the refresh code path rather than of the schema, which is exactly why they are written here — the schema cannot enforce them and a reviewer will not infer them.

**Identity tables get their own list, `IDENTITY_TABLES`, and never join `TENANT_TABLES`.** G7 asserts
that every name in `TENANT_TABLES` has a `workspace_id` policy. Adding `session` to it would make a
passing gate assert something false, which is worse than a gate that does not cover the table at all.

**`verification_attempt` has no row-level security, and a narrow grant instead.** Its rows are
written by unauthenticated requests that have no principal by definition, so any policy over it
would have to be permanently open — an honest grant of insert plus select restricted to the
identifier presented says what is true, where an always-true policy would read as protection.

**`verification_attempt` is append-only, one row per attempt**, holding the identifier, the channel,
the requesting IP, Fabric's reference for the live verification, `expires_at`, `consumed_at` and
`created_at`, indexed on `(identifier, created_at)` and `(ip, created_at)`, and pruned by the cron
worker of ADR 0022. A counter per window bucket would write less, but ADR 0029 also requires that a
resend inside the live window return the existing verification rather than mint another, so the
reference and the expiry have to be stored regardless — the counter would be a second structure
beside state that already answers the question. **There is no column for the code, ever.** ADR 0029
gave the code lifecycle to Fabric precisely so this codebase has no code store, no expiry sweep and
nothing to leak; a column would quietly take all three back.

**Session rows are hard-deleted on sign-out, revocation and expiry.** ADR 0046 keeps soft delete to
`media_asset`, and a `deleted_at` here would be the wrong shape anyway: the fact that a session
existed and was revoked belongs in `audit_event`, which is immutable, and not in a table whose
purpose is to list what is live right now. Every session create and revoke writes an `audit_event`.

**Deactivating a member does not delete their sessions, and `architecture.md` §16 is corrected
rather than implemented.** Deactivation removes access to one workspace through the per-request
membership read, immediately, and correctly leaves the person signed in to unrelated businesses.
Deleting session rows would sign someone out of workspace B for an event in workspace A. Sessions end
on user-level events only: sign-out, replay detection, absolute expiry, or the user themselves being
deactivated globally.

**`session` carries a truncated `user_agent` and the creation IP, and no `last_used_at`.** Remote
sign-out is unusable if a person cannot tell which row is the handset they lost, and that pair is
enough to recognise your own device without fingerprinting anyone. `last_used_at` is omitted because
every use rotates the token and therefore writes the row, so ADR 0046's trigger-written `updated_at`
already *is* last-used, to within one access-token lifetime. Two columns for one fact invite a reader
to believe they differ.

## Consequences

**Positive:** sign-out means something, on every device, at the moment it is pressed. A deactivated
member loses access to that workspace on their next request and keeps their other workspaces. Replay
of a rotated refresh token is detected rather than merely rejected, and detection revokes the family
rather than one token. The rate limit on the endpoint that spends money survives a deploy and is
shared across API instances. Identity tables are inside a row-level-security boundary of their own
rather than trusting a `WHERE` clause, and `TENANT_TABLES` keeps meaning exactly one thing.

**Negative / cost:** the 7-day lifetime costs roughly 4.3× ADR 0029's message budget, forever, and
that is the single largest recurring consequence in this record. The 15-minute JWT means remote
sign-out is bounded rather than instant for identity, and adds a signing key and a rotation plan to
own. The grace window on rotation is a deliberate hole, small but real. Setting `app.current_user`
from an unverified claim is sound for the reason given and will nonetheless look alarming to the next
reader, which is why the reasoning is here rather than in a comment.

Three columns' worth of device metadata is the thinnest thing that makes remote sign-out usable, and
it is thin: two handsets on the same network with the same browser will be hard to tell apart, and
the answer is a user-supplied label, which is product work nobody has scoped.

**Nothing in this record is built.** There is no `session` table, no `verification_attempt` table,
no `IDENTITY_TABLES`, and no auth module. The schema still holds `workspace` and nothing else.

**Rejected alternatives:**

- *Stateless refresh tokens.* Free, no table, no rotation write — and no way to end a session before
  it expires. `architecture.md` §16 already promised otherwise, and on a passwordless product the
  promise is the security model rather than a convenience.
- *Workspace-bound sessions.* Saves the per-request membership read, at the price of a role or
  deactivation change that does not apply until the access token expires. The read happens anyway.
- *An opaque access token.* Immediate identity revocation, paid for with a lookup on the hot path
  against the table rotation writes to. Worth revisiting if the 15-minute residual ever matters more
  than it does at pilot scale.
- *A chain table for rotation.* Detects replay from any generation, at roughly 670 rows per
  session-week that cannot be pruned without losing the detection.
- *Overwriting the hash in place.* One column fewer, and no replay detection at all.
- *Sliding expiry.* An immortal credential on a device with no password, and a spend figure that
  contradicts ADR 0029's own arithmetic.
- *Redis for rate-limit counters.* A new piece of infrastructure for a workload two orders of
  magnitude below the one ADR 0010 already chose Postgres for.
- *In-memory rate limits.* Reset on deploy, unshared between instances, on the one endpoint in the
  system where the failure mode is money.
- *SMS or WhatsApp notification on revocation.* Turns a security event into a spend lever for
  whoever can trigger it.

## Enforcement

None of these exist yet; each lands with the table it constrains, which is CV-12's first migration
rather than this record.

- **An invariant test that `session` has no `workspace_id` column**, which is the cheapest way to
  keep a well-meaning future change from binding sessions to a tenant and reintroducing the
  stale-role lag.
- **An invariant test that `verification_attempt` has no column holding a code.**
- **`IDENTITY_TABLES` was superseded before it was built** (ADR 0050). The assertion it described
  exists, as the `user-rls` class of one registry rather than a list of its own: RLS enabled and
  forced, exactly one permissive policy to `convert_app`, and a policy expression matched
  structurally against `app.current_user`. Adding it turned out not to create a fourth vacuous gate,
  because it changed the loop inside G7's existing vacuous half rather than adding a gate — and it
  reports "no user-scoped tables yet" in its own line rather than inside a summary. `session` is not
  in the registry: a table joins it in the migration that creates it, and there is no migration.
- **`verification_attempt`'s access mechanism is superseded** (ADR 0050). Nothing enforces its read
  path, because there is no decision to enforce — a grant cannot restrict rows, so the mechanism
  this record described was never available. Both `user` and `verification_attempt` are named in
  `TABLE_ACCESS_BLOCKERS`, which fails the build if either is declared or migrated before CV-19
  decides what replaces it. That list is the enforcement; this bullet is not.
- **A test that a replayed generation revokes the family**, not the presented token.
- **A test that the refresh path sets `app.current_user` with `SET LOCAL` inside a transaction**, and that the setting does not survive the transaction. This is the condition the paragraph above depends on, and a bare `SET` would look identical in review.
