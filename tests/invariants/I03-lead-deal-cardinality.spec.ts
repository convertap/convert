/**
 * Invariant I03 - docs/architecture.md section 6
 *
 * A lead may exist with no deal. A deal requires a contact. A lead converts to at most one deal
 *
 * How to test it: Create a lead with no deal (must succeed), a deal with no contact (must fail), and a second deal from one lead (must fail).
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I03 - lead-deal-cardinality', () => {
  test.todo('a lead may exist with no deal. A deal requires a contact. A lead converts to at most one deal');
});
