/**
 * Invariant I04 - docs/architecture.md section 6
 *
 * lead.status = Converted requires a linked deal; Lost requires a lost_reason
 *
 * How to test it: Converted without a linked deal must fail; Lost without a lost_reason must fail.
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I04 - lead-terminal-status', () => {
  test.todo('lead.status = Converted requires a linked deal; Lost requires a lost_reason');
});
