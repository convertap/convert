/**
 * Invariant I05 - docs/architecture.md section 6
 *
 * deal outcomes Won/Lost are terminal; reopening creates a new deal, preserving history
 *
 * How to test it: Moving a Won or Lost deal back into an open stage must fail; reopening creates a new deal.
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I05 - deal-outcome-terminal', () => {
  test.todo('deal outcomes Won/Lost are terminal; reopening creates a new deal, preserving history');
});
