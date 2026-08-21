# Code Review Checklist

Gate G11. The machine gates catch layering, types, and coverage; this list catches the things a machine cannot see. It is deliberately specific to *this* product's failure modes. Generic advice ("is the code readable?") is left out because it never changes an outcome.

Reviewers: skip any section the diff does not touch. Do not skip §1.

**Last updated:** 2026-08-18

---

## 1. Every review, no exceptions

- [ ] **Tenancy.** Every new table has `workspace_id NOT NULL` and an RLS policy. No query bypasses RLS. No test disables RLS to pass. A test sets the workspace context instead.
- [ ] **Principal.** Every new use case takes a `Principal` as its first argument. Nothing reads an ambient session or a global.
- [ ] **Activity.** A state change a rep would expect to see in the timeline writes an `activity` row, with the acting principal recorded.
- [ ] **No layer leak.** Domain rules are in `core`, orchestration in `application`, HTTP in `api`, rendering in `web`. A rule in a controller is a finding even when the boundary checker allows it.
- [ ] **Errors.** Domain failures are typed and carry a code from the catalogue; mapping happens once in the `api` exception filter. No driver error, stack trace, or SQL text reaches a client.
- [ ] **No silent catch.** Every `catch` rethrows, converts to a typed error, or is justified in the PR body.
- [ ] **New failure modes have a catalogue entry** with a real user-facing sentence, honest `retryable`, and a status (ADR 0018).
- [ ] **UI picks error copy by code**, never by rendering `message`.

## 2. Data model changes

- [ ] Migration is forward-only and safe to run against a live database, no destructive rewrite of a populated table.
- [ ] New identifiers are ULIDs; no integer key appears in any DTO (I12).
- [ ] Money is integer pesewas, GHS (I8). No float, no double-parsed decimal string.
- [ ] Timestamps are UTC columns. Display and "overdue" arithmetic happen in `Africa/Accra` (I11).
- [ ] Phone numbers go through the single normalization function, on writes **and** on search (I2).
- [ ] `activity` and `consent` remain append-only; the migration does not grant `UPDATE` or `DELETE` (I6, I9).

## 3. Messaging changes

- [ ] No provider SDK imported above `packages/infra`, including "temporarily."
- [ ] The send path checks consent for marketing categories. The check lives in the send path, not in the UI, which the API and worker bypass (I9).
- [ ] Free-form WhatsApp sends check the conversation window before calling the provider, and the UI shows window state (I10).
- [ ] Provider webhook handlers store the raw event first, keyed on the provider's event ID, and stop on duplicate.
- [ ] Delivery status only advances. A late callback carrying an earlier state does not overwrite a later one.
- [ ] Sends are queued and paced, never looped inline over a recipient list.
- [ ] No message body or full phone number is written to logs.

## 4. Jobs and background work

- [ ] The job is idempotent and carries a dedupe key. Re-running it is harmless.
- [ ] Retries use backoff, and terminal failures land somewhere a human will look.
- [ ] Reminder logic cannot double-notify for the same task and due window.
- [ ] Long work is chunked; nothing assumes it will finish before a redeploy.

## 5. API changes

- [ ] `openapi.json` regenerated and committed in the same commit (G10).
- [ ] Every endpoint has a summary, a typed response, and a documented error shape.
- [ ] Every DTO field has an example.
- [ ] Pagination is cursor-based. No new offset pagination.
- [ ] Unsafe methods accept an `Idempotency-Key`.
- [ ] A response shape change is called out explicitly in the PR body. The web app consumes this.

## 6. Web changes

- [ ] Data is fetched in server components or route handlers, not in client effects. A client-side waterfall costs a round trip per hop on 3G.
- [ ] No API credential is reachable from browser code; the session stays in the httpOnly cookie (ADR 0013).
- [ ] `apps/web` imports only `@convert/contracts`.
- [ ] The screen works at 360 px wide, one-handed, with a thumb. This is a phone product.
- [ ] Interactive elements reach the 44 px touch target (`min-h-tap`), especially inside lists and pipeline columns.
- [ ] Loading, empty, and error states exist for every fetch. A dropped mobile connection is the normal case, not the edge case.
- [ ] No new client dependency without a note on its transferred size. The budget is 150 KB gzipped (G9).
- [ ] Semantic or domain tokens only, no raw Tailwind colour utilities (`bg-emerald-600`) in product components.
- [ ] Stage, source, message status, and window state use their domain tokens, not ad-hoc colours (`design-system.md` §3).
- [ ] State is never colour alone. A label or icon carries it too.
- [ ] Lucide icons imported individually, never through a barrel.
- [ ] New tokens pass `python tools/check_contrast.py` (G13). Contrast is fixed by changing lightness, never by enlarging text.
- [ ] Product logic stayed out of `components/ui`; new product components landed in `components/convert`, `patterns`, or `layouts`.

## 7. Security

- [ ] Public lead form: rate limited, validated, no stored data reflected back to the submitter.
- [ ] Webhook ingress: signature verified before parsing.
- [ ] No secret in code, config, or test fixture. Nothing new logged that contains PII.
- [ ] Authorization checked in the `application` layer, not only hidden in the UI.
- [ ] Any new export or bulk read path respects per-workspace scoping and is audited.

## 8. Tests

- [ ] Domain rules are unit-tested in `core`, without a database.
- [ ] Anything touching the schema has an integration test against real Postgres.
- [ ] A touched invariant's `test.todo` has become a real assertion.
- [ ] Tests assert behaviour, not implementation detail. Renaming a private method should not break them.

## 9. Before approving

- [ ] The PR body says what it does **not** do, if scope was deliberately left out.
- [ ] Nothing here needed a verbal walkthrough to be understood.
- [ ] No `TODO` without an issue reference, no commented-out code, no leftover `console.log`.
- [ ] If a guardrail was changed, an ADR arrived with it (G2) and the PR body names it.

---

### Reviewer note

Approving means you believe this is correct, not that you could not find anything wrong. If you did not have time to review it properly, say so instead of approving. An unread approval is worse than no review, because it launders the risk.
