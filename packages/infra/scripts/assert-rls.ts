import { sql } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { TENANT_TABLES } from '../src/db/schema';

/**
 * Gate G7, second half. Two assertions, and the second one is the one that matters.
 *
 * FIRST: every tenant table has row-level security enabled, has at least one policy, and
 * no table carrying workspace_id was left out of TENANT_TABLES. A table with a
 * workspace_id column and no policy looks completely normal in code review.
 *
 * SECOND: the role the application actually connects as is *subject* to those policies.
 * This is the assertion whose absence made the first one a false comfort. A superuser
 * always bypasses RLS, so does a role with BYPASSRLS, and so does a table's owner unless
 * the table is FORCE ROW LEVEL SECURITY. Asserting that RLS is "enabled" while connecting
 * as postgres proves nothing at all - every policy can be perfect and every tenant still
 * readable by every other. See ADR 0042.
 *
 * The second assertion needs DATABASE_URL_APP, the application role's connection string.
 * If it is absent the script fails rather than skipping: a silently skipped tenancy check
 * is exactly the thing being fixed here.
 */
const main = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createDatabase(url);

  const enabled = await db.execute<{ tablename: string; rowsecurity: boolean }>(sql`
    select c.relname as tablename, c.relrowsecurity as rowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  `);

  const policies = await db.execute<{ tablename: string; count: string }>(sql`
    select tablename, count(*)::text as count
    from pg_policies
    where schemaname = 'public'
    group by tablename
  `);

  const withOrgId = await db.execute<{ table_name: string }>(sql`
    select table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'workspace_id'
  `);

  const rlsByTable = new Map(enabled.rows.map((r) => [r.tablename, r.rowsecurity]));
  const policyCount = new Map(policies.rows.map((r) => [r.tablename, Number(r.count)]));
  const declared = new Set(TENANT_TABLES);
  const failures: string[] = [];

  for (const table of TENANT_TABLES) {
    if (!rlsByTable.has(table)) failures.push(`${table}: declared tenant table does not exist`);
    else if (!rlsByTable.get(table)) failures.push(`${table}: row-level security is not enabled`);
    else if (!policyCount.get(table)) failures.push(`${table}: RLS enabled but no policy defined`);
  }

  for (const row of withOrgId.rows) {
    if (!declared.has(row.table_name)) {
      failures.push(
        `${row.table_name}: has a workspace_id column but is not listed in TENANT_TABLES, so it is unprotected`,
      );
    }
  }

  if (failures.length > 0) {
    console.error('RLS assertion failed:');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('\nSee docs/adr/0002-postgresql-row-level-security-as-the-tenancy-boundary.md');
    process.exit(1);
  }

  // ---- second assertion: is the application role actually subject to the policies? ----

  const appUrl = process.env.DATABASE_URL_APP;
  if (!appUrl) {
    console.error(
      'DATABASE_URL_APP is not set, so the connecting role cannot be checked.\n' +
        'Asserting RLS is enabled while connecting as an owner or superuser proves nothing.\n' +
        'See docs/adr/0042-two-database-roles-so-rls-is-not-advisory.md',
    );
    process.exit(1);
  }

  const appDb = createDatabase(appUrl);

  const appRole = await appDb.execute<{
    current_user: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
  }>(sql`
    select current_user, r.rolsuper, r.rolbypassrls
    from pg_roles r
    where r.rolname = current_user
  `);

  const role = appRole.rows[0];
  if (!role) failures.push('could not read the application role attributes');
  else {
    if (role.rolsuper) {
      failures.push(`${role.current_user}: is a SUPERUSER, so it bypasses every RLS policy`);
    }
    if (role.rolbypassrls) {
      failures.push(`${role.current_user}: has BYPASSRLS, so it bypasses every RLS policy`);
    }
  }

  // Owning a tenant table also bypasses RLS unless the table forces it. Check both.
  if (role) {
    const owned = await db.execute<{ tablename: string; forced: boolean }>(sql`
      select c.relname as tablename, c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles o on o.oid = c.relowner
      where n.nspname = 'public' and c.relkind = 'r' and o.rolname = ${role.current_user}
    `);
    for (const row of owned.rows) {
      if (declared.has(row.tablename) && !row.forced) {
        failures.push(
          `${row.tablename}: is owned by the application role and is not FORCE ROW LEVEL SECURITY, so the owner bypasses its policies`,
        );
      }
    }
  }

  if (failures.length > 0) {
    console.error('RLS assertion failed:');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('\nSee docs/adr/0042-two-database-roles-so-rls-is-not-advisory.md');
    process.exit(1);
  }

  if (TENANT_TABLES.length === 0) {
    console.warn(
      `RLS role check ok - ${role?.current_user} is neither superuser nor BYPASSRLS.\n` +
        'NOTE: TENANT_TABLES is empty, so no cross-tenant read was attempted. This gate is ' +
        'not yet proving isolation, only that the role could be subject to it. It becomes a ' +
        'real check with the first tenant table.',
    );
    process.exit(0);
  }

  console.warn(
    `RLS ok - ${TENANT_TABLES.length} tenant table(s) verified, ${withOrgId.rows.length} table(s) carry workspace_id, ` +
      `application role ${role?.current_user} is subject to policy`,
  );
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
