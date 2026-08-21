import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';

/**
 * Gate G7, third assertion: the column conventions of ADR 0046, checked against the
 * catalogue rather than against a reviewer's memory.
 *
 * These are the rules that repeat on every table, so getting them inconsistent is not one
 * bug, it is one bug per table for the life of the schema. Each check below exists because
 * the failure it catches is silent:
 *
 *   MONEY as float or numeric      a total that is off by a pesewa, on some rows, sometimes
 *   TIMESTAMP without a zone       an instant that means nothing without knowing who wrote it
 *   updated_at on an insert-only   a column that can never change, inviting a reader to trust it
 *   deleted_at spreading           a second mandatory predicate; the query that forgets leaks
 *   bigint read as a JS number     silent truncation past 2^53, which no catalogue can see
 *
 * The last one is why this file also reads the Drizzle source. `mode: 'bigint'` and
 * `mode: 'number'` produce the same Postgres bigint column, so information_schema cannot
 * tell them apart - the difference exists only in TypeScript, and it is the difference
 * between exact money and money that starts rounding.
 *
 * It reads the catalogue as the OWNER, because that is the role that can see everything.
 * Privileges are read with has_table_privilege against convert_app, the role the
 * application really connects as (ADR 0042).
 *
 * Honesty about what this proves today: with only `workspace` in the schema it checks four
 * columns and passes. It says so rather than reporting a bare green tick. It starts being
 * worth something with the first migration, which is precisely when it needs to already
 * exist — a convention introduced alongside twelve tables never gets applied to all twelve.
 */

/** Money is integer pesewas (I8). The suffix is what makes the rule checkable. */
const PESEWAS_SUFFIX = '_pesewas';

/** Rates are integer basis points: 15% is 1500, 2.5% is 250. Exact, and never a float. */
const BASIS_POINT_SUFFIX = '_bp';

/**
 * No column, anywhere, may carry one of these. `numeric` is exact but invites a decimal
 * GHS amount; the float types are not exact at all. Banning the types outright is stronger
 * than any naming rule, because it does not depend on someone naming the column honestly.
 */
const BANNED_TYPES = new Set(['numeric', 'money', 'real', 'double precision', 'decimal']);

/**
 * Soft delete is the exception, not the pattern (ADR 0046). A `deleted_at` on every table
 * means every query must remember one more predicate, and the one that forgets leaks
 * rather than errors. Adding a table here requires an ADR.
 */
const SOFT_DELETE_ALLOWED = new Set(['media_asset']);

type Column = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
};

const main = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createDatabase(url);

  const columns = await db.execute<Column>(sql`
    select c.table_name, c.column_name, c.data_type, c.is_nullable
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    order by c.table_name, c.ordinal_position
  `);

  const byTable = new Map<string, Column[]>();
  for (const column of columns.rows) {
    const existing = byTable.get(column.table_name);
    if (existing) existing.push(column);
    else byTable.set(column.table_name, [column]);
  }

  const failures: string[] = [];
  const at = (c: Column) => `${c.table_name}.${c.column_name}`;

  for (const column of columns.rows) {
    // ---- money and rates ----
    if (BANNED_TYPES.has(column.data_type)) {
      failures.push(
        `${at(column)}: is ${column.data_type}. Money is integer pesewas in bigint and rates are integer basis points (I8, ADR 0046)`,
      );
    }
    if (column.column_name.endsWith(PESEWAS_SUFFIX) && column.data_type !== 'bigint') {
      failures.push(`${at(column)}: names pesewas but is ${column.data_type}, expected bigint`);
    }
    if (column.column_name.endsWith(BASIS_POINT_SUFFIX) && column.data_type !== 'integer') {
      failures.push(`${at(column)}: names basis points but is ${column.data_type}, expected integer`);
    }

    // ---- time ----
    if (column.data_type === 'timestamp without time zone') {
      failures.push(
        `${at(column)}: is timestamp without time zone. All timestamps are stored UTC as timestamptz (I11)`,
      );
    }
    // A due point is an instant, not a day. A date column forces a time to be invented at
    // read, and the worker sweeps every five minutes (ADR 0046).
    if (column.data_type === 'date') {
      failures.push(
        `${at(column)}: is date. There are no date columns - a due point is a timestamptz instant (ADR 0046)`,
      );
    }

    // ---- deletion ----
    if (column.column_name === 'deleted_at' && !SOFT_DELETE_ALLOWED.has(column.table_name)) {
      failures.push(
        `${at(column)}: soft delete is the exception, not the pattern. Adding a second table needs an ADR (ADR 0046)`,
      );
    }
    // Deactivation is a domain state with rules (I7), not an absence. Different word,
    // different column, so a reversible state never reads as a tombstone.
    if (column.column_name === 'deleted_at' && byTable.get(column.table_name)?.some((c) => c.column_name === 'deactivated_at')) {
      failures.push(
        `${at(column)}: table carries both deleted_at and deactivated_at. Pick the one that is true`,
      );
    }
  }

  // ---- created_at everywhere; updated_at exactly where UPDATE is allowed ----

  const appRoleExists = await db.execute<{ exists: boolean }>(sql`
    select exists (select 1 from pg_roles where rolname = 'convert_app') as exists
  `);
  const canCheckPrivileges = appRoleExists.rows[0]?.exists === true;

  if (!canCheckPrivileges) {
    // Not a skip. The updated_at rule is the one that catches an insert-only table
    // carrying a column that can never change, and silently not running it is the
    // failure mode this whole file exists to avoid.
    failures.push(
      'convert_app does not exist, so the updated_at rule cannot be checked. Run the bootstrap first (ADR 0042)',
    );
  }

  for (const [table, cols] of byTable) {
    const names = new Set(cols.map((c) => c.column_name));
    const createdAt = cols.find((c) => c.column_name === 'created_at');

    if (!createdAt) {
      failures.push(
        `${table}: has no created_at. The ULID primary key encodes the same instant, but only application code can read it out of a uuid column (ADR 0046)`,
      );
    } else {
      if (createdAt.data_type !== 'timestamp with time zone') {
        failures.push(`${table}.created_at: is ${createdAt.data_type}, expected timestamptz`);
      }
      if (createdAt.is_nullable !== 'NO') {
        failures.push(`${table}.created_at: is nullable. A row always has a creation instant`);
      }
    }

    if (!canCheckPrivileges) continue;

    const updatable = await db.execute<{ can: boolean }>(sql`
      select has_table_privilege('convert_app', ${`public.${table}`}, 'UPDATE') as can
    `);
    const canUpdate = updatable.rows[0]?.can === true;
    const hasUpdatedAt = names.has('updated_at');

    if (canUpdate && !hasUpdatedAt) {
      failures.push(
        `${table}: the application may UPDATE it but it has no updated_at, so a change leaves no trace`,
      );
    }
    if (!canUpdate && hasUpdatedAt) {
      failures.push(
        `${table}: UPDATE is revoked but it carries updated_at, a column that can never change. Insert-only tables correct by appending, not by editing (I6)`,
      );
    }
  }

  // ---- the one rule the catalogue cannot see ----
  // Both Drizzle modes emit `bigint`, so this is a source check or it is nothing. ADR 0046
  // bans `mode: 'number'` outright rather than only on money columns: the truncation is
  // silent whatever the column is named.
  const schemaPath = resolve(__dirname, '../src/db/schema.ts');
  const schemaSource = readFileSync(schemaPath, 'utf8');
  for (const [index, line] of schemaSource.split('\n').entries()) {
    const code = line.replace(/\/\/.*$/, '').replace(/\*.*$/, '');
    if (!/\bbigint\s*\(/.test(code)) continue;
    if (/mode:\s*'number'/.test(code)) {
      failures.push(
        `schema.ts:${index + 1}: bigint with mode: 'number' truncates silently past 2^53. Use mode: 'bigint' (ADR 0046)`,
      );
    } else if (!/mode:\s*'bigint'/.test(code)) {
      failures.push(
        `schema.ts:${index + 1}: bigint without an explicit mode defaults to a lossy read. Pass mode: 'bigint' (ADR 0046)`,
      );
    }
  }

  if (failures.length > 0) {
    console.error('Column convention assertion failed:');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('\nSee docs/adr/0046-column-conventions-for-money-time-and-history.md');
    process.exit(1);
  }

  const tableCount = byTable.size;
  const columnCount = columns.rows.length;

  if (tableCount === 0) {
    // Say it plainly. An empty schema satisfies every rule above and proves nothing, and
    // reporting that as a pass is the habit this repository keeps having to unlearn.
    console.warn(
      'Column conventions: the schema has no tables, so nothing was checked and nothing is proven.',
    );
    return;
  }

  console.warn(`Column conventions hold: ${columnCount} column(s) across ${tableCount} table(s).`);
  if (tableCount <= 1) {
    console.warn(
      `That is thin — one table (${[...byTable.keys()][0]}) and no migrations yet. The check exists\n` +
        'now so the first migration cannot be written without it: a convention introduced\n' +
        'alongside twelve tables never gets applied to all twelve.',
    );
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
