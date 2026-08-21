# What and why

<!-- One or two sentences. Link the story or checklist ID (e.g. R3, E0, I10). -->

## What this deliberately does not do

<!-- Scope you left out on purpose, so a reviewer does not flag it as missing. Delete if not applicable. -->

## How it was verified

<!-- Not "tests pass" — what did you actually exercise? Which device, which provider account, which role? -->

---

## Checklist

Author signs before requesting review. Full list: `docs/code-review-checklist.md`.

**Always**
- [ ] New tables have `workspace_id NOT NULL` plus an RLS policy; no test disables RLS
- [ ] New use cases take a `Principal` (ADR 0003)
- [ ] Rep-visible state changes write an `activity` row with the acting principal
- [ ] Domain rules live in `core`, not in a controller or a React component
- [ ] Verified with a second workspace that data does not leak across tenants

**If the API changed**
- [ ] `openapi.json` regenerated and committed (G10, ADR 0015)
- [ ] Every new endpoint has a summary, typed response, documented errors, DTO examples
- [ ] Response-shape changes called out above — `apps/web` consumes this

**If the schema changed**
- [ ] Migration is forward-only and safe against a populated table
- [ ] ULID external ids, integer pesewas, UTC timestamps
- [ ] `activity` / `consent` grants withhold `UPDATE` and `DELETE`

**If messaging changed**
- [ ] No provider SDK above `packages/infra`
- [ ] Consent checked in the send path; conversation window checked before the provider call
- [ ] Webhook handler stores the raw event first and is idempotent on replay
- [ ] Exercised against a real provider account, not a mock

**If the web app changed**
- [ ] Fetching happens in server components or route handlers, not client effects
- [ ] No API credential reachable from browser code (ADR 0013)
- [ ] Checked at 360 px on a real phone
- [ ] New client dependencies noted with their transferred size (budget: 150 KB gzipped)

**Tests**
- [ ] Domain rules unit-tested without a database
- [ ] Schema-touching changes have integration tests against real Postgres
- [ ] Any invariant this touches is now a real assertion, not `test.todo`

**If a guardrail changed**
- [ ] An ADR arrived in this PR and is named here: <!-- ADR number -->

<!--
No agent or tool co-authorship trailers in commits.
CI gates: docs/engineering-guardrails.md §3. Run `python tools/check_boundaries.py` locally first.
-->
