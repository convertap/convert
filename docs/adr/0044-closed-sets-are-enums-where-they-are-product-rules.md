# ADR 0044 - Closed sets are Zod schemas and Postgres enums where they are product rules, and tables where a workspace configures them

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

The schema is full of small closed sets: lead status, lead source, member role, invoice state, payment origin, product kind, consent channel, message status. Each could be a native Postgres enum, a `text` column with a `CHECK` constraint, or a lookup table with a foreign key. Choosing once matters because the choice repeats on nearly every table.

Working the question surfaced an asymmetry that had already been decided without being stated. **Deal stage is not in that list, because `architecture.md` §6 already models `pipeline` and `pipeline_stage` as tables**, seeded with one default per workspace, so the multiple pipelines the deck promises can arrive without rewriting every deal query. Meanwhile **lead status is a product rule whose exact values the invariants depend on**: I4 requires that `converted` has a linked deal and that `lost` is terminal.

Those are two different kinds of thing wearing the same clothes. One is configuration a business owns; the other is a rule the product owns.

A third constraint fixed where the values live: `.boundaries.json` allows `web` to import `contracts` and nothing else. So any set the browser must render has to be defined in `contracts`.

## Decision

**Split by kind, not by uniformity.**

**A set whose values are product rules is a native Postgres enum.** Lead status, lead source, member role, invoice state, payment origin, product kind, consent channel, message status.

**A set a workspace configures is a table.** Deal stage stays `pipeline_stage`, as already modelled. Nothing changes there; this record just stops it being changed by accident.

**Native enum rather than `text` with a `CHECK`,** for a reason that turned out to be the deciding one: **a Postgres enum sorts by declaration order.** Verified against Postgres 16:

```
ORDER BY the enum column ->  new contacted qualified converted lost   -- funnel order
ORDER BY the text cast   ->  contacted converted lost new qualified   -- alphabetical
'new' < 'contacted'      ->  true
```

A pipeline view, a funnel report and a dashboard all want funnel order. With `text` that needs a `CASE` expression or a redundant sort column in every such query. With an enum it is free. The enum is also 4 bytes, is documented in the catalogue so tooling can read it, and refuses an unknown label outright (`invalid input value for enum`).

The usual complaint about enums — that `ALTER TYPE` is awkward and a value cannot be removed without recreating the type — is **a feature here**. Adding a lead status changes I4 and the state machine. It *should* take a migration and a moment's thought, not a one-line constraint swap.

**The values live in `packages/contracts` as `as const` tuples, and everything else derives from them.** `infra` builds each `pgEnum` from the tuple, `core` derives its union types, `web` renders labels. One tuple, so the database type, the domain type and the browser cannot drift apart. A `CLOSED_SETS` map collects them all so a test can assert the properties that must hold across every set, and a new set cannot quietly skip them.

**Every shared shape in `contracts` is a Zod schema, and Zod is that layer's one dependency.** A tuple gives a compile-time type and nothing at runtime, so an unknown value arriving from an HTTP request, a webhook or a form is only caught when the database refuses it — deep in a request, as a 500 rather than a 400. `z.enum(TUPLE)` gives runtime validation, `z.infer` gives the type, and the tuple still feeds `pgEnum`: one literal, three consumers.

The tuple stays the source rather than the schema. Zod 4 removed `.Enum` and `.Values` in favour of `.enum`, and depending on an accessor name for the array that builds the database type is a needless coupling when the literal is right there.

Identifiers move the same way: `ulidSchema` is `z.string().regex(...).brand<'Ulid'>()`, with `isUlid` and `asUlid` now thin wrappers over `safeParse` and `parse`. The brand still means a raw string cannot be passed where an id is expected.

This required correcting `.boundaries.json`, which described `contracts` as depending on nothing. It now depends on Zod, deliberately and only on Zod — validation is what the layer is *for*, so the dependency is the point rather than a compromise.

**Transitions are enforced in the domain layer, not the database.** A `CHECK` constraint cannot express "lost is terminal" because it needs the previous value. So the enum constrains the *set* and the domain constrains the *movement* (I4, I5), with an invariant test behind it. A trigger was considered and rejected: it would put business rules somewhere nobody looks.

## Consequences

**Positive:** funnel ordering comes free everywhere, which removes a `CASE` expression from every pipeline and dashboard query and removes the temptation of a redundant `sort_order` column that can disagree with the value beside it. Unknown values are refused by the database rather than by a constraint whose name means nothing to the reader. Deriving everything from one tuple removes the commonest drift in a codebase like this — the database, the API type and the UI label list agreeing on four of five values. And the split puts friction exactly where changing something changes the product, while leaving flexibility where a business legitimately differs.

**Negative / cost:** two patterns to learn rather than one, and the line between them is a judgement call that will be argued again. Removing an enum value means recreating the type, which is genuinely painful and will eventually be needed — the answer is that it should be, because a value in use has rows pointing at it.

**Zod reaches the browser**, because `contracts` is the only package `web` may import, and gate G9 enforces a mobile JavaScript budget against a 2.5 s LCP target on Ghanaian networks. Zod 4 publishes `zod/mini` for exactly this case, and the web path should use it. That is not yet measured — G9 will say so once `apps/web` stops being a placeholder, and if the budget is threatened the answer is `zod/mini` on the web side rather than dropping validation.

**One consequence deliberately left open.** The api generates its OpenAPI document from `@nestjs/swagger` decorators (ADR 0015), and G10 fails on drift. Zod schemas in `contracts` plus decorated DTO classes in the api would declare every shape twice, which is the drift this record exists to remove. Resolving it needs a bridge such as `nestjs-zod` or `@asteasolutions/zod-to-openapi`, and that is a decision about DTOs rather than about closed sets, so it is a separate ticket rather than a paragraph here.

**And a trap that cost me a wrong reading during this very ticket:** casting an enum to text silently loses the ordering. My first probe did `select s::text ... order by s`, where `s` resolves to the *text output column*, and I briefly believed Postgres sorted enums alphabetically. Sorting must happen in the database on the enum column, never on a serialised copy — and sorting in TypeScript is sorting strings, so it needs `LEAD_STATUSES.indexOf` rather than `.sort()`. This is written into the `enums.ts` docstring, where someone will actually meet it.

Deal stage being a table also means deal queries carry a join that lead queries do not, which reads as an inconsistency until you know why. That asymmetry is the price of the deck's editable-pipelines promise.

**Rejected alternatives:**

- *Every closed set a lookup table.* One uniform pattern, with ordering, display labels and per-workspace customisation free for all of them, and i18n later trivial. Rejected because it costs a join per status on every read, and — the real objection — it would let a workspace invent a lead status that I4 cannot reason about. An invariant that a business can edit around is not an invariant.
- *Every closed set an enum, including deal stage.* Fastest, smallest, no joins. Rejected because it contradicts a decision already made in `architecture.md` §6 and would turn multiple pipelines into a migration plus a rewrite of every deal query.
- *`text` with a `CHECK` constraint.* Readable in psql and trivially alterable, which is its own argument. Rejected on ordering: alphabetical is useless for a funnel, and the fix is a `CASE` in every query or a second column that can contradict the first.
- *`text` with a `CHECK` plus a `sort_order` column.* Solves ordering and keeps easy evolution. Rejected because two columns encoding one fact will disagree, and preventing that needs a trigger — more machinery than the enum it was avoiding.
- *Tuples only, with no runtime validation.* What I first wrote, and it is what prompted the correction. A compile-time union is worth nothing against a value arriving from an HTTP request, a Meta webhook or a form field — the first thing that would catch it is the database, as a 500 rather than a 400.
- *A hand-rolled validator per set.* No dependency, and it is what `ids.ts` did with a regex and a thrown `Error`. Rejected because it is the same work Zod already does, with worse messages, and because it does not compose into DTO validation the way a schema does.
- *Values defined in the migration, TypeScript generated from the schema.* Makes the database unambiguously the source. Rejected because `web` may only import `contracts`, so generated types would have to be republished there anyway, and the values stop being readable without running a build step.
- *A database trigger enforcing terminality as well.* Would stop even direct SQL reviving a lost lead. Rejected because it puts business logic in the one place nobody thinks to look, and duplicates a rule that already has a home and a test.

## Enforcement

- **I4 and I5** continue to own transitions; the enums own the sets. Neither is sufficient alone and the split is deliberate.
- Nine tests in `packages/contracts/src/enums.spec.ts`. Three of them are the ones this record turns on: every schema **accepts** each of its own values, every schema **rejects** a value it does not define and rejects the empty string, and a schema rejects a value belonging to a *different* set — `whatsapp` is a lead source and a consent channel but never a lead status. The other six, over `CLOSED_SETS`: no empty set, no duplicate value, every value lower snake case because it becomes an enum label, lead status in funnel order and provably *not* alphabetical, message status in progression order, and lead sources matching the `channel-*` design tokens one for one — because a source with no token is a source the pipeline cannot render.
- One test asserts `deal_stage` is **absent** from `CLOSED_SETS`. If someone adds it, they have reversed `architecture.md` §6 by accident, and the test says so.
- `infra` builds every `pgEnum` from the contracts tuple rather than restating the values, so drift is not possible without deleting the import. G1 keeps the tuples in `contracts`, which is also the only package `web` can reach.
