/**
 * Invariant I09 - docs/architecture.md section 6
 *
 * A marketing message requires a live consent row for that channel at send time
 *
 * Decision record: ADR 0008.
 *
 * How to test it: Send a marketing template with no live consent row and assert it is refused in the send path, not the UI.
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I09 - consent-required-for-marketing', () => {
  test.todo('a marketing message requires a live consent row for that channel at send time');
});
