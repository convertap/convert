/**
 * Invariant I01 - docs/architecture.md section 6
 *
 * Every tenant-owned row carries a non-null workspace_id. No cross-tenant access, except an audited platform-admin action (ADR 0030, ADR 0035)
 *
 * How to test it: Query as the application role with a workspace context set and assert rows from another workspace are invisible; then assert a platform-admin cross-tenant read writes an audit_event.
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I01 - workspace-scoping', () => {
  test.todo('Every tenant-owned row carries a non-null workspace_id. No cross-tenant access, except an audited platform-admin action (ADR 0030, ADR 0035)');
});
