/**
 * Invariant I12 - docs/architecture.md section 6
 *
 * Every entity's primary key is a ULID in a uuid column, supplied by the application.
 * There is no internal identifier, so none can leak (ADR 0043, superseding ADR 0004).
 *
 * How to test it: assert every table's primary key is a uuid column with no default;
 * assert no API response ever emits a uuid-formatted id; round-trip a ULID through
 * ulidToUuid and back. The round-trip half is already covered by
 * packages/contracts/src/ids.spec.ts, including that uuid ordering matches ULID
 * ordering - the property the index-locality argument rests on.
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I12 - ulid-primary-keys', () => {
  test.todo(
    'every primary key is a ULID in a uuid column with no database default, and no internal id exists to leak',
  );
});
