/**
 * Invariant I01 - docs/architecture.md section 6
 *
 * Every tenant-owned row carries a non-null org_id; no cross-org foreign key ever resolves
 *
 * Decision record: ADR 0002.
 *
 * How to test it: Set the org context and assert a query without it returns nothing. Never disable RLS to make this pass.
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I01 - org-scoping', () => {
  test.todo('every tenant-owned row carries a non-null org_id; no cross-org foreign key ever resolves');
});
