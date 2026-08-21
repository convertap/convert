/**
 * Invariant I02 - docs/architecture.md section 6
 *
 * A phone number is unique per workspace across contact_phone, and every stored number is matchable for inbound. A collision surfaces a merge prompt, never a validation error (ADR 0030)
 *
 * How to test it: Insert the same E.164 number twice in one workspace (must surface a merge prompt, not an error), the same number in a different workspace (must succeed), and match an inbound message against a non-primary number (must find the contact).
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I02 - contact-phone-uniqueness', () => {
  test.todo('A phone number is unique per workspace across contact_phone, and every stored number is matchable for inbound. A collision surfaces a merge prompt, never a validation error (ADR 0030)');
});
