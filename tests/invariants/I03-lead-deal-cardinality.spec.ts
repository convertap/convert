/**
 * Invariant I03 - docs/architecture.md section 6
 *
 * A lead may exist with no deal. A deal requires a contact and references one product. A lead may have many deals, at most one open per product (ADR 0031)
 *
 * How to test it: Create a lead with no deal (must succeed), a deal with no contact (must fail), two deals on one lead for different products (must succeed), and a second open deal for the same product (must fail).
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I03 - lead-deal-cardinality', () => {
  test.todo('A lead may exist with no deal. A deal requires a contact and references one product. A lead may have many deals, at most one open per product (ADR 0031)');
});
