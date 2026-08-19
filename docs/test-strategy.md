# Test Strategy

What gets tested, at which level, and why. The shape follows from the architecture: because `core` and `application` are framework-free, most of the value is testable without a database, a browser, or a provider account, and that is where the bulk of the tests live.

**Last updated:** 2026-08-18

---

## 1. Levels

| Level | Location | Runs against | Speed | What it proves |
|-------|----------|--------------|-------|----------------|
| Unit, domain | `packages/core/**/*.spec.ts` | nothing external | milliseconds | Business rules are correct in isolation |
| Unit, use case | `packages/application/**/*.spec.ts` | in-memory port fakes | milliseconds | Authorization, entitlements, orchestration, activity writes |
| Invariant | `tests/invariants` | real Postgres where the rule is enforced there | seconds | The architecture's own rules (I1–I12) |
| Integration | `tests/integration` | real Postgres, real migrations | seconds | Repositories, RLS, transactions, queue behaviour |
| Contract | `tests/integration` | generated OpenAPI spec | seconds | The API matches its published shape |
| End-to-end | `tests/e2e` | web → api → Postgres | minutes | The flows a pilot user actually performs |

Two hard rules:

- **Never mock Postgres.** RLS, constraints, and transaction semantics are the behaviour under test. A mocked database proves the code calls a function.
- **Never mock the WhatsApp provider for acceptance.** Fakes are fine for unit tests of orchestration. Whether a template is approved, a window is open, or a number is throttled is only answerable against a real account. That is why the Definition of Done requires it for messaging stories.

---

## 2. Where each kind of logic is tested

| Logic | Tested at | Not tested at |
|-------|-----------|---------------|
| Lead/deal state transitions | domain unit | e2e |
| Consent gate decision | domain unit + invariant I9 | UI |
| Conversation window calculation | domain unit + invariant I10 | integration |
| Authorization and visibility (R3) | use case unit + integration | e2e only |
| Tenancy isolation | invariant I1 + integration | anywhere else |
| Phone normalization and search parity | domain unit + integration | manual |
| Money arithmetic | domain unit | database |
| Reminder due/overdue timing | domain unit with injected clock + integration | e2e |
| Provider payload parsing | integration with recorded fixtures | domain |
| Idempotency of jobs and webhooks | integration | unit |
| Screen behaviour on mobile | e2e + manual on a real device | unit |

Time is injected, never read from the system clock inside `core`. A rule that depends on `Date.now()` cannot be tested for the Accra boundary conditions that matter (I11).

---

## 3. Invariant tests

The executable form of `architecture.md` §6, and the single most valuable thing in this strategy. Rules in `docs/engineering-guardrails.md` §4:

- One file per invariant, named `I<NN>-<slug>.spec.ts`.
- Assert the **rule**, not the implementation. I6 attempts an update through the repository, the ORM, and the raw connection, and asserts that all three fail.
- An unbuilt invariant is a `test.todo` carrying the invariant text. CI gate G6 fails if a file is missing, so the list cannot silently shrink.
- Removing an invariant needs an ADR.

All twelve stubs exist today. Each carries a "how to test it" note so the person implementing the feature does not have to re-derive the intent.

---

## 4. Fixtures and data

- **Factories, not fixtures files.** A test builds the minimum it needs, `aContact({ phone })`, so a schema change breaks one builder rather than forty files.
- **Every factory takes an organization.** Making the tenant explicit in test setup is what makes cross-tenant tests natural to write.
- **Recorded provider payloads** live alongside the integration tests, captured from real webhook traffic during the spike and redacted. Hand-written provider JSON encodes what we *think* the provider sends.
- **No shared mutable state between tests.** Each test runs in a transaction that rolls back, or against a uniquely-named organization.

---

## 5. What we deliberately do not test

Stated so nobody adds it later thinking it was an oversight:

- Framework behaviour. Nest's DI and Next's router are not under test.
- Getters, setters, and pure DTO mapping with no logic.
- Third-party client internals.
- Exhaustive UI snapshots. They break on every design change and catch almost nothing; the mobile behaviour that matters is checked by e2e and by a human on a phone.
- Coverage as a target. Coverage is reported, never gated. A percentage goal produces tests written to raise the percentage.

---

## 6. End-to-end scope

Small on purpose. Only the flows whose failure ends the pilot:

1. Register a business, invite a rep, rep accepts, rep signs in.
2. Capture a lead from the public web form; it appears in the pipeline with its source.
3. Assign a lead, log an activity, set a follow-up, see the reminder appear.
4. Convert a lead to a deal, move it through stages, mark it won.
5. Send a message to a contact and see it on the timeline with a delivery status.
6. Owner sees the dashboard reflecting all of the above.

Run on a mobile viewport by default. Desktop is the secondary case for this product, so it is the secondary case here.

---

## 7. CI mapping

| Gate | Level |
|------|-------|
| G5 | Domain and use case unit tests |
| G6 | Invariant coverage (existence), then the tests themselves |
| G7 | Migrations plus the RLS assertion |
| G8 | Integration tests against real Postgres |
| G9 | Performance budget on the pipeline and contact screens |
| G10 | OpenAPI spec currency, and contract tests against it |

End-to-end tests run on `main` and before a release rather than on every pull request. They are the slowest and the most likely to flake, and a flaky required check trains people to re-run without reading.
