# ADR 0045 - Zod schemas are the single source for the OpenAPI document, adapted to Nest in the api layer

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** -
**Superseded by:** -

## Context

ADR 0044 made every shared shape in `packages/contracts` a Zod schema, and closed with one consequence deliberately left open: the api generates its OpenAPI document from `@nestjs/swagger` decorators (ADR 0015), so a request body would be declared twice — once as a Zod schema in `contracts`, once as a decorated DTO class in `apps/api`. That is precisely the drift ADR 0044 exists to remove, reintroduced one layer up.

Four constraints bound the answer:

- **ADR 0015 is not negotiable.** The spec is generated from code and committed as `apps/api/openapi.json`, and gate G10 fails on drift. Whatever bridges the two must still produce that committed file.
- **ADR 0018 makes errors first class.** The error envelope is a shared shape, so this decision applies to it too.
- **`.boundaries.json` allows `web` to import `contracts` and nothing else**, so the schemas must stay importable from the browser.
- **Gate G9 bounds the browser bundle** against a 2.5 s LCP target on Ghanaian networks. Anything a bridge adds to `contracts` lands in that bundle.

Reading the ecosystem changed the shape of the choice. **Zod 4 converts to JSON Schema natively**: `z.toJSONSchema(schema, { target: 'openapi-3.0' })` is in the library. Neither package the ticket named is required in order to *convert*. `nestjs-zod` 5.x calls exactly that function under the hood for Zod 4; what it adds is the Nest wiring around it.

That reframes the two candidates the ticket listed. `@asteasolutions/zod-to-openapi` needs `extendZodWithOpenApi(z)` monkeypatching and `.openapi()` calls on the schemas themselves, which means a second dependency inside `contracts` — a straight contradiction of ADR 0044's "Zod is that layer's one dependency". The same objection retires `zod-openapi`, which wants its own `.meta()` helper in the same place. `nestjs-zod`, by contrast, never touches `contracts`: `createZodDto(schema)` produces a class, and classes live in the api.

Two things also surfaced while reading the code, both of which this decision has to settle because it rewrites the files they live in:

- **Nothing validates a request today.** There is no `ValidationPipe` and no class-validator. The api parses nothing, and `ErrorFilter.classify()` returns code, message and status only — so `ErrorEnvelope.details` is a field that no code path can ever populate, while `validation_failed` copy tells the user to "check the highlighted fields".
- **`pagination.ts` uses `Buffer`**, a Node global, in the one package `web` imports.

And one honesty problem. ADR 0015 and `engineering-guardrails.md` §6.1 both state that G10 "fails on an endpoint with no summary, no response type, or an untyped body". Nothing checked it. CI ran the regenerate-and-diff half only. A single documented endpoint hid the gap for three days.

## Decision

**The Zod schema in `contracts` is the source. The DTO class is a derived adapter, and it lives in `apps/api`.**

**`nestjs-zod` is the bridge**, added to `apps/api` and nowhere else.

```
packages/contracts/src/       zod, and only zod
  enums.ts, ids.ts            unchanged
  errors.ts                   ErrorEnvelope becomes errorEnvelopeSchema
  pagination.ts               pageRequestSchema, cursorPageOf(item, name)

apps/api/src/interface/http/  nestjs-zod lives here
  *.dto.ts                    class ThingDto extends createZodDto(thingSchema) {}

apps/api/src/openapi/document.ts   cleanupOpenApiDoc(document, { version: '3.0' })
apps/api/src/app.module.ts         { provide: APP_PIPE, useClass: ZodValidationPipe }
```

**The naming rule is what makes "declared twice" impossible rather than merely discouraged:** `<thing>Schema` in `contracts` becomes `<Thing>Dto` in the api, and the class body is always empty. A DTO that adds a field means the schema is wrong; the fix is the schema, never the class. This is visible to a reviewer at a glance, which is the point.

**Responses are declared with `@ZodResponse({ type: ThingDto })`, not `@ApiOkResponse`.** A schema carrying a transform has two shapes — what the wire sends and what the handler receives — and `@ApiOkResponse` documents the input shape by default, silently. `@ZodResponse` selects the output shape.

**Requests are validated.** `ZodValidationPipe` is registered globally, and `ErrorFilter` gains a branch mapping a Zod validation failure to `details: FieldError[]`, with `field` as the dotted path to the offending property. The pipe without the mapping would be worse than neither: every bad body would arrive as a bare `validation_failed` with no fields, and the error copy already promises otherwise.

**Examples ride on the schema**, as `.meta({ example })` in `contracts`, not as an `@ApiProperty` override in the api. One place, and `web` reads the same examples for placeholders. The cost is example strings in the browser bundle, which is bytes against a budget measured in kilobytes.

**The document stays OpenAPI 3.0.** `cleanupOpenApiDoc(doc, { version: '3.0' })` targets it and Zod's own target flag matches. 3.1 buys exact `null` and `const` handling that no shape here needs yet, at the cost of client-generator breadth for the typed web client ADR 0015 promises. Revisiting is a one-line `DocumentBuilder` change and a regenerated spec.

**`errors.ts` and `pagination.ts` move with three specific shapes.** `ErrorEnvelope` becomes `errorEnvelopeSchema`. `CATALOGUE` stays plain data and does not become a schema: it is a server-side lookup that never crosses the wire, and publishing it would ship every `userMessage` to any integrator who reads the spec. `CursorPage<T>` becomes a factory, `cursorPageOf(itemSchema, name)`, where the name registers a component — `LeadCursorPage`, `ContactCursorPage` — because an anonymous inline page shape on every list endpoint makes a generated client emit a fresh throwaway type per route.

**The cursor is the ULID string.** The base64url encoding is deleted along with the `Buffer` call that implemented it. A ULID is already 26 URL-safe characters; encoding it yields 36 characters that decode back in one line, so the encoding obscured nothing while putting a Node global in the browser's import path. The cursor stays opaque by contract — documented as "do not parse" — rather than by an obfuscation anyone can reverse.

**G10's second half becomes real**, in `tools/check_openapi_complete.py`, reading the committed artifact rather than the decorators.

## Consequences

**Positive:** one declaration per shape, which is what ADR 0044 was for. Request validation arrives as a side effect rather than as a later project, and it arrives at the boundary where ADR 0018 says validation belongs — so an unknown enum value becomes a 400 with a named field instead of a 500 from the database. `ErrorEnvelope.details` stops being decorative. The typed web client ADR 0015 promises gets a spec whose component names are stable, including for paginated responses. And a documented gate stops being fictional.

**Negative / cost:** a community dependency in the request path of every endpoint. `nestjs-zod` also requires remembering `cleanupOpenApiDoc` — forget it and the document generates, looks plausible, and is subtly wrong, which is a failure mode a reviewer will not catch by reading the diff. The `@ZodResponse` versus `@ApiOkResponse` distinction is a second such trap. Both are mitigated by G10's completeness check only partially: it proves a schema is present, not that it is the right one of the two.

Deleting the cursor encoding changes a wire format. That is free today and stops being free the moment a client ships, which is the argument for doing it in this change rather than a later one.

**A gate that is still not checking everything, said out loud rather than reported green.** `tools/check_openapi_complete.py` enforces five properties: a summary, an `operationId`, at least one tag, a typed 2xx response, and a typed request body where one exists. It does **not** yet enforce ADR 0015's requirement that every operation document a failure response against the error envelope, because that cannot be honestly enforced until the envelope is a Zod-derived DTO every controller declares — it arrives with the implementation of this record, not before. It also does not enforce that every schema property carries an example, which would fail today on array properties that carry their example on the item. Both omissions are written into the tool's docstring where the next person meets them.

**Rejected alternatives:**

- *`@asteasolutions/zod-to-openapi`*, named in the ticket. Rejected because it requires `extendZodWithOpenApi(z)` and `.openapi()` calls on the schemas, putting a second dependency inside `contracts` and so inside the browser bundle — reversing ADR 0044's central constraint to solve a problem Zod 4 now solves natively. `zod-openapi` (samchungy) loses on the identical objection.
- *A hand-rolled adapter over `z.toJSONSchema`*, with no new dependency. Genuinely tempting, and it is the same library call `nestjs-zod` makes. Rejected because the conversion is the easy part: `$ref` naming, component registration, input-versus-output selection, and `@Body()` parameter type inference are the work, and reimplementing them badly costs more than the dependency. This remains the **named exit** if `nestjs-zod` goes unmaintained, and it is a cheap exit precisely because the schemas are in `contracts` and the classes are in one directory.
- *Keeping both mechanisms* — Zod for values and identifiers, decorated classes for HTTP shapes. Rejected because it is the drift ADR 0044 was written to remove, and because the two would disagree first on the shapes that matter most: the ones a webhook or a form posts.
- *Generating Zod schemas from the OpenAPI document instead*, making the spec the source. Rejected because it inverts ADR 0015, which chose code-first over spec-first deliberately, and because `web` would then depend on a build step to see a type.
- *OpenAPI 3.1.* Rejected for now on client-generator support, and revisitable in one line.
- *Leaving G10's second half to a separate ticket.* Rejected because this decision is the moment it becomes checkable, the tool is a short read over a committed JSON file, and the repository's standing rule is to say when a gate passes without checking anything rather than let it report green.

## Enforcement

- **`.boundaries.json`** forbids `nestjs-zod` and `@nestjs/swagger` in `contracts`. G1 therefore fails the build on a DTO class in the shared package, which is the one move that would put Nest into the browser bundle. This is the `.boundaries.json` change G2 requires an ADR for, and this record is it.
- **Gate G10, first half:** `openapi:generate` plus `git diff --exit-code`, unchanged.
- **Gate G10, second half:** `tools/check_openapi_complete.py`, added to `.github/workflows/ci.yml`. Verified by making it fail — a spec doctored to drop a summary, a response schema and a body schema produced three named failures and exit 1, and the restored spec passes.
- **Gate G9** measures whether Zod in the browser costs more than the budget allows, once `apps/web` stops being a placeholder. The answer if it does is `zod/mini` on the web path, per ADR 0044, not dropping validation.
- The review checklist item for §6.1 covers the two traps a machine cannot catch: `cleanupOpenApiDoc` present on the document, and `@ZodResponse` rather than `@ApiOkResponse` on responses.
