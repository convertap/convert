/**
 * Invariant I02 - docs/architecture.md section 6
 *
 * (org_id, phone_e164) is unique on contact; a second attempt surfaces a merge prompt rather than a validation error
 *
 * How to test it: Insert the same E.164 number twice in one org and assert the second surfaces a merge, not a raw constraint error.
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I02 - contact-phone-uniqueness', () => {
  test.todo('(org_id, phone_e164) is unique on contact; a second attempt surfaces a merge prompt rather than a validation error');
});
