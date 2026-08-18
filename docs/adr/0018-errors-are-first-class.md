# ADR 0018 - Errors are a first-class part of the product

**Status:** Accepted
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

The usual arrangement is that error handling accretes: a `try/catch` here, a toast saying "Something went wrong" there, a status code chosen per endpoint by whoever wrote it. It works until someone has to support the product.

Convert cannot afford that, for reasons specific to how it is used. A rep is standing in front of a customer, on a phone, on a network that drops mid-request. "Something went wrong" is not merely unhelpful there - it is expensive, because the rep cannot tell whether the WhatsApp message was sent, whether pressing send again will charge twice, or whether to stop trying and take the customer's number on paper.

The failure modes are also unusually specific and unusually *legitimate*. A closed 24-hour conversation window is not an error in the sense of a bug; it is WhatsApp telling us what this rep may do next, and the interface has to say so in those terms. Missing marketing consent is a legal boundary, not a glitch. A provider throttle is expected traffic. Each needs different words, a different HTTP status, and a different answer to "should this be retried".

Three consumers depend on getting this right: the rep reading a screen, the web BFF deciding whether to retry, and - once the Pro-tier public API ships - an integrator writing code against our responses. Only the first tolerates prose.

## Decision

**Every failure is defined once, in one place, with everything each consumer needs.**

`packages/contracts/src/errors.ts` holds a closed set of error codes and, for each, a catalogue entry giving:

1. a **stable code** - the contract consumers branch on, never changed silently
2. an **HTTP status** - so the transport mapping is declared once, not per controller
3. a **user-facing sentence** - what happened and what to do next, in that order
4. **retryability** - so clients and jobs never guess
5. whether it is **our fault** - which decides whether it pages someone

Rules that follow:

- **Domain and use-case failures are typed**, thrown as `UseCaseError` carrying a code. Layers below the interface never know what an HTTP status is.
- **One exception filter** maps everything to the envelope, at the API boundary. It logs once, there - lower layers throw without also logging, or one failure appears four times and none of the four is the whole story.
- **No driver error, SQL fragment, or stack trace reaches a client.** Anything unrecognised becomes `internal_error`, and the detail stays in the log.
- **Every response carries a `requestId`**, so a rep saying "it failed" is diagnosable rather than a guessing game.
- **Never build user-facing text from `message`.** That is a technical string. The interface picks copy by code.
- **No silent catch.** Catch to add context or to convert to a typed error. A caught error that is neither rethrown nor converted has to be justified in review.
- **The error envelope is in the OpenAPI spec** with the full code list, because branching on a code is the contract and branching on a message is not.
- **Adding a failure mode means adding a catalogue entry** - which forces someone to write the user-facing sentence at the moment they invent the failure, the only time they actually know what it means.

## Consequences

**Positive:** error copy is written once and is consistent across every screen. The web BFF and the job runner can decide retry behaviour from data rather than from a guess. Support can correlate a complaint with a log line. The public API arrives with documented failures instead of a documentation project. Product-legitimate states - closed window, missing consent, plan limit - get explained in the interface rather than surfacing as generic failures, which is the difference between a product that feels finished and one that does not.

**Negative / cost:** friction on purpose. Adding a failure mode is no longer one `throw` - it is a catalogue entry with a sentence someone has to write, and a test asserts the sentence exists and is not a placeholder. The closed code set means an unanticipated failure lands as `internal_error` until someone classifies it properly. Both are deliberate: they convert a decision that would otherwise be made silently in a hurry into one made visibly.

**Rejected alternatives:** a `Result`-type discipline throughout, which reads well in the domain but turns every call site into plumbing in a CRUD-heavy product, and which NestJS interceptors and Next.js server actions both fight. Free-form error strings with per-endpoint statuses, which is the default and is what this ADR exists to prevent. Reusing HTTP status codes as the whole vocabulary, which cannot distinguish `duplicate_contact` from `conflict` from `consent_missing`, all of which are 409 and none of which mean the same thing to a rep.

## Enforcement

`CATALOGUE` is exhaustive over `ErrorCode` by type. Tests in `packages/contracts/src/errors.spec.ts` assert every code has a real user-facing sentence, a sane status, honest retryability, and no internal leakage. The single `ErrorFilter` in `apps/api` is the only transport mapping. Gate G10 keeps the envelope and its code list in the committed OpenAPI spec. Review checklist items cover silent catches, user-facing copy, and required error states in the UI.
