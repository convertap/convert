# ADR 0043 - The ULID is the primary key

**Status:** Accepted
**Date:** 2026-08-21
**Supersedes:** 0004
**Superseded by:** -

## Context

ADR 0004 decided "every entity carries an opaque ULID as its external identifier. Internal integer keys never leave the process." It sat at **Proposed**, and the one table that exists does not match it:

```ts
id: uuid('id').primaryKey().defaultRandom(),          // a random uuid v4
externalId: text('external_id').notNull().unique(),   // the ULID
```

The internal key is not an integer. It is a **random** uuid v4, which is the detail that matters.

The two-key pattern earns its keep by pairing a *small, sequential* primary key with an opaque public one: cheap 8-byte foreign keys, inserts landing at the tip of the index, and nothing guessable exposed. This design collects neither half of that. A random uuid v4 is 16 bytes inserted in random B-tree order — the worst case for index locality, because every insert lands in a different leaf page — and there is a second unique index on a 26-character text column on top. Two keys, two indexes, and the benefit of neither.

It was also the right moment to fix: `externalId` appeared in exactly one file, and no code depended on it. The cost of this decision was zero and would have risen with every table added.

## Decision

**The ULID is the primary key. There is no second identifier.**

**Stored in a `uuid` column.** A ULID is exactly 128 bits and so is a uuid: 16 fixed-width bytes, native indexing, and — because a ULID is big-endian with the timestamp first — the same sort order in the database as in the application. `text` would cost 26 bytes on every key *and every foreign key*, with collation-aware string comparison instead of a fixed-width one.

**Generated in the application, with no database default.** ADR 0011's outbox pattern needs the id before the insert, inside the same transaction, and generating in the application avoids a Postgres extension on a managed cluster we do not control. Omitting the default is deliberate rather than an oversight: with `not null` and no default, a row typed by hand in psql **fails loudly** instead of silently receiving a database-generated id that the outbox never recorded.

**The helpers live in `packages/contracts`**, which `.boundaries.json` already designates for "ULID helpers", and which is the only package both web and api may import. **Implemented rather than taken from a package**, because that layer's stated purpose is that it "depends on nothing" — and a ULID is 40 lines of base32.

`newUlid`, `isUlid`, `asUlid`, `ulidTime`, `ulidToUuid`, `uuidToUlid`. The branded `Ulid` type stays, so a raw string cannot be passed where an id is expected.

## Consequences

**Positive:** one identifier in the whole system, so no boundary translates between two and **no code can return the wrong one**. That is the consequence worth the most: leaking an internal key does not crash — it silently makes ids enumerable, and you find out when a customer tells you. Being time-ordered, the ULID gives the index locality that wanting a sequential primary key was *for*, which uuid v4 threw away. Sorting by id is sorting by creation time, so "newest leads first" needs no separate index on `created_at`. And one key means one index per table rather than two, which is less to write, less to maintain and less to get wrong.

**Negative / cost:** foreign keys are 16 bytes rather than the 8 a `bigint` would use. At a few thousand contacts per workspace this is noise, and it would not be at a hundred million rows — a scale this product does not have and would redesign for anyway.

**The real cost is operational, and it was the closest call in this decision.** psql shows `0189-3f7e-…`, not the `01ARZ3…` a customer reads out on a support call. During a pilot with hands-on support that friction is repeated, and it argues genuinely for `text`. It was accepted because a key type propagates into every index and foreign key permanently while the debugging gap has a cheap fix — `uuidToUlid` exists, and the API only ever emits the ULID form. A bad key type has no cheap fix. If support pain proves worse than expected, this is the decision to revisit, and `text` is a defensible answer.

Two ULIDs minted in the same millisecond sort arbitrarily relative to each other. Sort order is by creation time to the millisecond, not a total order, and anything needing a strict sequence should not be using an identifier for it.

**Rejected alternatives:**

- *Two keys: `bigint` primary key plus ULID external, as ADR 0004 literally prescribed.* The cheapest possible joins, and it recovers the locality uuid v4 lost. Rejected because it keeps a translation layer at every boundary and keeps the silent bug class — returning the internal number leaks nothing loudly, it just makes ids countable and guessable. Buying 8 bytes per foreign key with that risk is a bad trade at this scale.
- *Keep two keys but fix the primary key to `bigserial`.* The smallest diff from what exists. Rejected for the same reason, plus a sequential integer leaks row counts if it ever escapes — how many customers each SME has is exactly the thing not to publish.
- *Store the ULID as `text(26)`.* What the schema did. Better for support, and the honest counter-argument to this record; see above.
- *Store as `bytea`.* 16 bytes and correct sort order, like `uuid`, but unreadable in psql without `encode()` and with none of uuid's native tooling. Strictly worse than `uuid` for the same size.
- *Generate in the database via an extension or plpgsql function.* Guarantees every row has an id however it was inserted. Rejected because the outbox pattern needs the id first, and because it adds a migration dependency on a managed Postgres cluster we do not control. Failing loudly on a hand-insert is the better failure mode.
- *Take `ulid` from npm.* Fewer lines of ours to own. Rejected because `.boundaries.json` says this layer depends on nothing, and it is the package the browser bundle imports — a dependency there is a dependency everywhere.

## Enforcement

- **I12** covers it, restated: every entity's primary key is a ULID in a `uuid` column, supplied by the application. There is no internal identifier to leak because there is no second key.
- Ten unit tests in `packages/contracts/src/ids.spec.ts`, and two of them are the ones that matter: 500 round-trips through the uuid storage form, and **uuid ordering matching ULID ordering**, which is the property the index locality argument rests on. If that second test ever fails, this decision is wrong.
- `schema.ts` carries no `defaultRandom()` on an id column, and the comment says why, so the next table copied from it inherits the reasoning rather than just the shape.
- G1 keeps the helpers in `contracts`; nothing above it may reimplement them.
