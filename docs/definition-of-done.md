# Definition of Done

Gate G12. A story is not done when the code merges. It is done when a pilot SME could use it without anyone from the team present — that is the bar set by `mvp-scope.md` §28, and this list is how it gets checked story by story.

**Last updated:** 2026-08-18

---

## Every story

**Built**
- [ ] Acceptance criteria met, all of them, including the ones that were inconvenient.
- [ ] Works on a 360 px viewport, on a real phone, on a throttled connection — not only in a desktop browser at 1440 px.
- [ ] Loading, empty, and error states exist. "Empty" gets real attention: a new organization sees every screen empty first, and that is the first impression.
- [ ] Every error state answers three questions: what happened, what to do now, and whether their work survived (`docs/error-handling.md` section 5).
- [ ] Nothing half-wired behind a flag without the flag being documented.

**Correct**
- [ ] Unit tests for domain rules; integration tests for anything touching the schema.
- [ ] Any invariant this story touches has a real assertion, not a `test.todo`.
- [ ] Manually exercised the unhappy paths: duplicate submit, dropped connection mid-write, back button, stale tab, expired session.

**Safe**
- [ ] Authorization enforced in `application`, verified as both an owner and a rep.
- [ ] Cross-tenant check done: a second organization cannot see or touch this data. Verified, not assumed.
- [ ] No new PII in logs.

**Visible**
- [ ] Errors reach the error tracker with enough context to diagnose without a reproduction.
- [ ] The events needed for the activation metric — 10 contacts and 1 deal within 7 days (`mvp-scope.md` §26) — are emitted if this story touches that path. Retrofitted analytics measure nothing.

**Documented**
- [ ] `openapi.json` current if the API changed.
- [ ] An ADR exists if an architectural decision was made or superseded.
- [ ] Product docs updated if behaviour now differs from `mvp-scope.md`. If the two disagree, one of them is a bug — resolve it, do not leave it.

**Reviewed**
- [ ] All CI gates green, none skipped or overridden.
- [ ] `docs/code-review-checklist.md` signed by someone who did not write the code.

---

## Additionally, for messaging stories

- [ ] Exercised end to end against a real provider account, not a mock. A mocked WhatsApp send proves nothing about templates, windows, or throttling.
- [ ] Confirmed behaviour with the conversation window both open and closed.
- [ ] Confirmed the consent gate refuses a marketing send with no consent.
- [ ] Confirmed duplicate provider callbacks change nothing.
- [ ] Confirmed the cost per message, and recorded it — message economics is an open question in `product-spec.md` §12 and this is how it closes.

## Additionally, for anything on the capture path

- [ ] Source is recorded on every lead, from every entry point. Source tagging is load-bearing for the whole Learn step (`product-spec.md` §3); a lead with no source is a permanent gap in the dashboard.
- [ ] Duplicate phone numbers behave as decided in R1 — merge prompt, not a raw constraint error.

---

## Not done, however tempting

A story is **not** done if any of the following is true. Each of these has a habit of being called done:

- It works on the developer's machine but nobody ran it on a phone.
- The happy path is tested and the failure path is "we'll see."
- It is behind a flag nobody has enabled and nobody has scheduled to enable.
- The tests pass because they assert what the code does rather than what the rule is.
- Tenancy was "obviously fine" and never checked with a second organization.
- The API changed and `openapi.json` did not.

---

## Release-level, before pilot users touch it

Beyond per-story done. This is `mvp-scope.md` §28 with the operational parts made explicit.

- [ ] A new business can register, invite a rep, and complete the full lead-to-deal workflow with no developer involvement.
- [ ] Follow-up reminders have been observed firing at the correct Accra local time, on a real device.
- [ ] Backups verified by restoring one, not by trusting that backups are configured.
- [ ] Error tracking, uptime alerting, and queue-depth alerting are live and pointed at someone.
- [ ] Provider quality rating and template approval status are visible to the team — a silent WhatsApp quality downgrade throttles sends and reads as a product bug.
- [ ] Pilot data terms signed (checklist L2), and the per-organization export and delete paths exist.
- [ ] Someone owns the pilot support channel, and pilot SMEs know how to reach them.
