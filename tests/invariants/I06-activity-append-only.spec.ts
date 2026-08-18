/**
 * Invariant I06 - docs/architecture.md section 6
 *
 * activity rows are insert-only. No update, no delete, at any layer
 *
 * Decision record: ADR 0009.
 *
 * How to test it: Attempt update and delete through every available path, including the raw connection, and assert all fail.
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I06 - activity-append-only', () => {
  test.todo('activity rows are insert-only. No update, no delete, at any layer');
});
