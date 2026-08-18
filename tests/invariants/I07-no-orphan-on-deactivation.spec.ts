/**
 * Invariant I07 - docs/architecture.md section 6
 *
 * Deactivating a member never orphans records: reassignment is required in the same transaction
 *
 * How to test it: Deactivate a member holding leads without supplying a reassignment target and assert the whole transaction rolls back.
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I07 - no-orphan-on-deactivation', () => {
  test.todo('deactivating a member never orphans records: reassignment is required in the same transaction');
});
