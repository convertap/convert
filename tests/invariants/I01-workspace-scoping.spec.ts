/**
 * Invariant I01 - docs/architecture.md section 6
 *
 * Every tenant-owned row carries a non-null workspace_id. No cross-tenant access, except an audited platform-admin action (ADR 0030, ADR 0035)
 *
 * **The first half is now proven, and not here.** `tests/integration/tenancy.spec.ts` connects as
 * the application role against a real Postgres and asserts that a workspace context sees its own
 * workspace and members and nothing else, that an account cannot read another account even by
 * direct id, and that an unset context returns nothing rather than raising. Four of its seven tests
 * fail if `convert_app` is granted BYPASSRLS, which is how that suite was shown to assert something.
 *
 * This file cannot hold those assertions: the `invariants` project has no database, and a unit test
 * that mocked one would prove the mock. So the specs live where the boundary is, and this file
 * records where to look.
 *
 * **The second half is still unbuilt**: the audited platform-admin exception. ADR 0035 defers the
 * admin surface, so there is no cross-tenant read to audit yet and nothing to assert about it. That
 * is the todo below, and it is a real gap rather than a formality - I1 stopped being absolute the
 * moment that exception was decided.
 */

describe('I01 - workspace-scoping', () => {
  test.todo(
    'a platform-admin cross-tenant read writes an audit_event (ADR 0035, deferred with the admin surface)',
  );
});
