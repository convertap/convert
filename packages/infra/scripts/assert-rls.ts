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

  // ---- third assertion: does isolation actually hold? ----
  //
  // The two checks above are necessary and not sufficient: they prove the role *could* be
  // subject to policy, not that a cross-tenant read returns nothing. This proves it, on a
  // fixture table this script creates and drops, so it does not wait for the first
  // migration and does not care what the real schema looks like.
  //
  // The control matters as much as the test: the owner must see BOTH rows. Without that,
  // an empty result could mean isolation works or could mean the query was simply wrong,
  // and a test that cannot fail is not a test.

  const A = '11111111-1111-1111-1111-111111111111';
  const B = '22222222-2222-2222-2222-222222222222';
  const isolation: string[] = [];

  try {
    await db.execute(sql`drop table if exists rls_probe`);
    await db.execute(sql`
      create table rls_probe (
        id bigserial primary key,
        workspace_id uuid not null,
        note text not null
      )
    `);
    await db.execute(sql`alter table rls_probe enable row level security`);
    await db.execute(sql`alter table rls_probe force row level security`);
    // nullif is load-bearing. Without it an empty context raises invalid input syntax for
    // uuid instead of returning no rows, so a forgotten context becomes a 500 rather than
    // an empty list. Verified against Postgres 16 on 21 August 2026.
    await db.execute(sql`
      create policy tenant_isolation on rls_probe
        using (workspace_id = nullif(current_setting('app.current_workspace', true), '')::uuid)
    `);
    await db.execute(sql`grant select, insert, update, delete on rls_probe to convert_app`);
    await db.execute(sql`grant usage, select on sequence rls_probe_id_seq to convert_app`);
    await db.execute(sql`
      insert into rls_probe (workspace_id, note)
      values (${A}::uuid, 'belongs to A'), (${B}::uuid, 'belongs to B')
    `);

    const asApp = async (workspaceId: string | null) => {
      if (workspaceId === null) {
        await appDb.execute(sql`select set_config('app.current_workspace', '', false)`);
      } else {
        await appDb.execute(sql`select set_config('app.current_workspace', ${workspaceId}, false)`);
      }
      const rows = await appDb.execute<{ note: string }>(sql`select note from rls_probe`);
      return rows.rows.map((r) => r.note).sort();
    };

    const seenA = await asApp(A);
    if (seenA.length !== 1 || seenA[0] !== 'belongs to A') {
      isolation.push(`workspace A context returned ${JSON.stringify(seenA)}, expected only A's row`);
    }

    const seenB = await asApp(B);
    if (seenB.length !== 1 || seenB[0] !== 'belongs to B') {
      isolation.push(`workspace B context returned ${JSON.stringify(seenB)}, expected only B's row`);
    }

    // A forgotten context must leak nothing, rather than everything.
    const seenNone = await asApp(null);
    if (seenNone.length !== 0) {
      isolation.push(`an empty workspace context returned ${JSON.stringify(seenNone)}, expected nothing`);
    }

    // And an explicit attempt to read across tenants must come back empty.
    await appDb.execute(sql`select set_config('app.current_workspace', ${A}, false)`);
    const cross = await appDb.execute<{ note: string }>(
      sql`select note from rls_probe where workspace_id = ${B}::uuid`,
    );
    if (cross.rows.length !== 0) {
      isolation.push('an explicit cross-tenant query returned rows, so isolation is not holding');
    }

    // The control. If this does not see both rows, the test above proves nothing.
    const asOwner = await db.execute<{ note: string }>(sql`select note from rls_probe`);
    if (asOwner.rows.length !== 2) {
      isolation.push(
        `the owner saw ${asOwner.rows.length} row(s) rather than 2, so the empty results above ` +
          'cannot be attributed to row-level security',
      );
    }
  } finally {
    await db.execute(sql`drop table if exists rls_probe`);
  }

  if (isolation.length > 0) {
    console.error('RLS isolation assertion failed:');
    for (const failure of isolation) console.error(`  ${failure}`);
    console.error('\nSee docs/adr/0042-two-database-roles-so-rls-is-not-advisory.md');
    process.exit(1);
  }

  const scope =
    TENANT_TABLES.length === 0
      ? 'no tenant tables exist yet, so only the mechanism was proven, not the real schema'
      : `${TENANT_TABLES.length} tenant table(s) verified, ${withOrgId.rows.length} carry workspace_id`;

  console.warn(
    `RLS ok - ${role?.current_user} is neither superuser nor BYPASSRLS, and a cross-tenant read ` +
      `returned nothing while the owner saw both rows. ${scope}.`,
  );
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
