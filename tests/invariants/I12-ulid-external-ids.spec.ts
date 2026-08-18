/**
 * Invariant I12 - docs/architecture.md section 6
 *
 * Every entity exposes an opaque external ULID; internal integer keys never leave the process
 *
 * Decision record: ADR 0004.
 *
 * How to test it: Serialize one DTO of every kind and assert no numeric id and no internal key appears.
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I12 - ulid-external-ids', () => {
  test.todo('every entity exposes an opaque external ULID; internal integer keys never leave the process');
});
