/**
 * Invariant I08 - docs/architecture.md section 6
 *
 * Money is integer pesewas, currency fixed to GHS
 *
 * How to test it: Assert stored values are integers and that a fractional input is rejected rather than rounded.
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I08 - money-integer-pesewas', () => {
  test.todo('money is integer pesewas, currency fixed to GHS');
});
