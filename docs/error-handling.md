# Error Handling

Errors are a first-class part of Convert, not a fallback branch (ADR 0018). This is the working guide; the reasoning is in the ADR.

**Last updated:** 2026-08-18

---

## 1. Why this gets unusual attention here

A rep is in front of a customer, on a phone, on a network that drops mid-request. "Something went wrong" is expensive in that moment: they cannot tell whether the WhatsApp message went out, whether pressing send again charges twice, or whether to give up and write the number on paper.

Many of our failures are also not bugs. A closed 24-hour window is WhatsApp telling a rep what they may do next. Missing consent is a legal boundary. A provider throttle is normal traffic. Each needs its own words, status, and retry answer — which is why they are defined as data rather than handled ad hoc.

---

## 2. One definition per failure

`packages/contracts/src/errors.ts` is the single source. Each code carries:

| Field | Purpose |
|-------|---------|
| `status` | HTTP mapping, declared once instead of per controller |
| `retryable` | So clients and jobs never guess whether to try again |
| `userMessage` | What happened and what to do, in that order |
| `ourFault` | Whether it should page someone |

Adding a failure mode means adding an entry. That friction is the point: it makes someone write the user-facing sentence while they still know what the failure means.

---

## 3. Where each layer's responsibility ends

```
core          throws typed domain errors. Knows rules, not transport.
application   throws UseCaseError with a code. Knows use cases, not HTTP.
api           ErrorFilter maps code -> status -> envelope. Logs once, here.
web           picks copy by code. Never renders `message`.
worker        decides retry from `retryable`. Dead-letters what will not succeed.
```

The boundary rule: **layers below the interface throw and do not log.** A failure logged at every level appears four times and none of the four is the whole story.

---

## 4. Rules

**Never build user-facing text from `message`.** It is a technical string; showing it leaks internals and reads like a crash. Use `userMessageFor(code)`.

**No silent catch.** Catch to add context or to convert to a typed error, then rethrow. A `catch` that does neither must be justified in review — it is how a failed WhatsApp send becomes a lead that looks contacted but never was.

**Nothing internal reaches a client.** No driver error, SQL fragment, or stack trace. Unrecognised exceptions become `internal_error` and the detail stays in the log.

**Every response carries a `requestId`.** Without it, "it failed this morning" is unanswerable.

**Retry only what is retryable.** `provider_rejected` is not: sending again costs money and fails again. `provider_unavailable` is.

**Idempotency is what makes retries safe.** Every unsafe request accepts an `Idempotency-Key`; every job carries a dedupe key. Retry without it is a double charge.

**Log with structure, never with PII.** No message bodies, no full phone numbers — third-party data under Act 843. Use `maskPhone`.

---

## 5. In the interface

Every data surface has three states, and none is optional: **loading**, **empty**, and **error**. On a mobile connection the error state is a normal state, not an edge case.

An error state has to answer three questions:

1. **What happened** — in the customer's terms, not ours.
2. **What to do now** — retry, pick a template, ask an admin, wait.
3. **Whether their work survived** — the most common unspoken fear, and cheap to answer.

Product-legitimate states get explained rather than apologised for. A closed conversation window is not "an error occurred"; it is *"More than 24 hours have passed since this customer last messaged, so WhatsApp only allows an approved template now. Pick a template to continue."*

---

## 6. In jobs

Failures are expected traffic, so they are designed for:

- Exponential backoff on retryable failures.
- A dead-letter destination **a human looks at**. A silently dropped campaign send is a customer-visible failure with a money cost.
- Idempotent handlers, so a restart mid-send does not duplicate.
- Provider quality rating and template approval status surfaced to the team — a silent WhatsApp downgrade throttles sends and reads exactly like a product bug.

---

## 7. Testing failure

The unhappy paths are the point of most of these tests:

- Every catalogue entry is asserted to have a real sentence, a sane status, and honest retryability.
- Use-case tests assert the guard fires **before** the side effect: the consent test checks nothing was sent, not merely that an error was thrown.
- Duplicate provider callbacks must change nothing.
- Definition of Done requires manually exercising duplicate submit, dropped connection mid-write, back button, stale tab, and expired session.

---

## 8. Adding a failure mode

1. Add the code to `ERROR_CODES` and an entry to `CATALOGUE`, including the user-facing sentence.
2. Throw it as a `UseCaseError` from the layer that knows the rule.
3. Handle the code in the UI where it can occur, with copy from the catalogue.
4. Regenerate `openapi.json` (gate G10) so consumers see the new code.
5. If it is retryable, make sure the retry path is actually idempotent.
