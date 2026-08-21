/**
 * Invariant I07 - docs/architecture.md section 6
 *
 * Deactivating a member never orphans records: they are reassigned to a named member or returned to the unassigned queue (ADR 0032)
 *
 * How to test it: Deactivate a member holding records without naming a successor (records must land in the unassigned queue, never orphaned), and with a successor (records must move to them).
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I07 - no-orphan-on-deactivation', () => {
  test.todo('Deactivating a member never orphans records: they are reassigned to a named member or returned to the unassigned queue (ADR 0032)');
});
