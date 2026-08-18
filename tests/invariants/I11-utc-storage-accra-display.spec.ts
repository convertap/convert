/**
 * Invariant I11 - docs/architecture.md section 6
 *
 * All timestamps stored UTC; all display and all "due"/"overdue" arithmetic in Africa/Accra
 *
 * How to test it: A task due at 09:00 Accra must be stored as the matching UTC instant and must not read as overdue at 08:59 Accra.
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I11 - utc-storage-accra-display', () => {
  test.todo('all timestamps stored UTC; all display and all "due"/"overdue" arithmetic in Africa/Accra');
});
