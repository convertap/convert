import { sql } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { TENANT_TABLES } from '../src/db/schema';

/**
 * Gate G7, second half. Asserts that every tenant table has row-level security enabled
 * and at least one policy, and that no table carrying org_id was forgotten.
 *
 * This is the check that turns ADR 0002 from a document into a property of the database.
 * A table with an org_id column and no policy looks completely normal in code review.
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
    where table_schema = 'public' and column_name = 'org_id'
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
        `${row.table_name}: has an org_id column but is not listed in TENANT_TABLES, so it is unprotected`,
      );
    }
  }

  if (failures.length > 0) {
    console.error('RLS assertion failed:');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('\nSee docs/adr/0002-postgresql-row-level-security-as-the-tenancy-boundary.md');
    process.exit(1);
  }

  console.warn(
    `RLS ok - ${TENANT_TABLES.length} tenant table(s) verified, ${withOrgId.rows.length} table(s) carry org_id`,
  );
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
