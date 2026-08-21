import { getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { createDatabase } from '../src/db/client';
import type { Database } from '../src/db/client';
import {
  APP_ROLE,
  FORBIDDEN_PRIVILEGES,
  SCOPE_GUC,
  TABLE_ACCESS,
  TABLE_ACCESS_BLOCKERS,
  canonicalPolicySql,
} from '../src/db/access';
import type { TableAccess } from '../src/db/access';
import * as schema from '../src/db/schema';

/**
 * Gate G7, the assertion half.
 *
 * Six checks, reported one line each, because they become real at different moments and a single
 * summary line would let the vacuous ones pass for proven (ADR 0048). Today two are real - the
 * application role's attributes, and every declared Drizzle table being classified - and the rest
 * announce that there is no schema to look at yet.
 *
 * The registry the checks read is `src/db/access.ts` (ADR 0050). It replaced `TENANT_TABLES` and
 * `NON_TENANT_TABLES`, which classified by whether a table carried a `workspace_id` column and so
 * had nothing to say about a table protected some other way.
 *
 * Two things are worth knowing before changing anything here:
 *
 * The role check is the one whose absence made everything else a false comfort. A superuser bypasses
 * RLS, so does BYPASSRLS, and so does a table's owner unless the table is FORCE ROW LEVEL SECURITY.
 * Asserting "RLS is enabled" from a connection that ignores RLS proves nothing at all (ADR 0042).
 *
 * And the structural checks and the behavioural probe prove different things. The probe creates a
 * fixture table and shows a cross-tenant read returning nothing; it cannot see a table that does not
 * exist yet. The catalogue matching shows a real policy is exactly the canonical one; it cannot show
 * that the canonical one excludes a row. Both, or neither means much.
 */

type Subcheck = {
  name: string;
  failures: string[];
  /** What was actually proven, or - for a check with nothing to iterate - why it proved nothing. */
  verdict: string;
  real: boolean;
};

const ENTRIES = Object.entries(TABLE_ACCESS) as [string, TableAccess][];

/** The registry widened for lookup by a name that may not be in it. */
const REGISTRY: Record<string, TableAccess | undefined> = TABLE_ACCESS;
const RLS_KINDS = ['workspace-rls', 'user-rls'] as const;
type RlsKind = (typeof RLS_KINDS)[number];

/** Tables the registry says carry a policy, whatever it is scoped by. */
const rlsEntries = ENTRIES.filter((entry): entry is [string, TableAccess & { kind: RlsKind }] =>
  RLS_KINDS.includes(entry[1].kind as RlsKind),
);

/**
 * Every table declared in `schema.ts`, found by asking Drizzle rather than by keeping a list.
 * A new table joins this check by existing, which is the only way a coverage check stays honest.
 */
const declaredTables = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableName(table))
  .sort();

/**
 * The canonical policy expression, as this Postgres prints it.
 *
 * Derived rather than hardcoded. `pg_get_expr` output is formatting-sensitive - casts get spelled
 * out, literals get `::text` - and pinning a string here would mean a server upgrade failing a
 * policy that is in fact correct. So the script writes the canonical policy itself, on a throwaway
 * table, and reads back the form to compare against. Substring matching was rejected outright: a
 * check that `true or workspace_id = nullif(...)` passes is not a check (ADR 0050).
 */
const deriveCanonicalQual = async (db: Database, kind: RlsKind): Promise<string> => {
  const probe = 'rls_expr_probe';
  await db.execute(sql.raw(`drop table if exists ${probe}`));
  await db.execute(sql.raw(`create table ${probe} (scope_id uuid not null)`));
  await db.execute(sql.raw(`alter table ${probe} enable row level security`));
  await db.execute(sql.raw(canonicalPolicySql(probe, kind, 'scope_id')));
  const printed = await db.execute<{ qual: string }>(sql`
    select pg_get_expr(p.polqual, p.polrelid) as qual
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = ${probe}
  `);
  await db.execute(sql.raw(`drop table if exists ${probe}`));
  const qual = printed.rows[0]?.qual;
  if (!qual) throw new Error(`could not derive the canonical ${kind} expression`);
  return qual;
};

const main = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createDatabase(url);

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

  const subchecks: Subcheck[] = [];

  // ---- 1. every declared table is classified. Real today. ------------------------------------

  const classification: string[] = [];
  const blocked = new Set(Object.keys(TABLE_ACCESS_BLOCKERS));
  const classified = new Set(Object.keys(TABLE_ACCESS));

  for (const name of classified) {
    if (blocked.has(name)) {
      classification.push(
        `${name}: is in both TABLE_ACCESS and TABLE_ACCESS_BLOCKERS. A blocked name is a ` +
          'reservation, not a classification - resolve the read path or remove the entry',
      );
    }
  }

  for (const [name, access] of ENTRIES) {
    if (access.kind === 'role-grants' && access.reason.trim() === '') {
      classification.push(
        `${name}: role-grants with a blank reason. TypeScript's string admits '', and an ` +
          'unexplained absence of a policy is what ADR 0050 exists to stop reading as a decision',
      );
    }
    if (access.kind !== 'role-grants' && access.scopeColumn.trim() === '') {
      classification.push(`${name}: ${access.kind} with no scopeColumn, so no policy can be built`);
    }
  }

  for (const name of declaredTables) {
    const reason = TABLE_ACCESS_BLOCKERS[name as keyof typeof TABLE_ACCESS_BLOCKERS];
    if (reason) {
      classification.push(`${name}: declared while blocked. ${reason}`);
    } else if (!classified.has(name)) {
      classification.push(
        `${name}: declared in schema.ts and absent from TABLE_ACCESS, so nothing says how it is ` +
          'protected. See docs/adr/0050-one-table-access-registry-classified-by-what-the-gate-demands.md',
      );
    }
  }

  subchecks.push({
    name: 'declared schema to registry',
    failures: classification,
    real: declaredTables.length > 0,
    verdict:
      declaredTables.length > 0
        ? `${declaredTables.length} declared table(s) classified: ${declaredTables.join(', ')}`
        : 'no tables are declared in schema.ts, so there was nothing to classify',
  });

  // ---- 2. the application role is subject to policy at all. Real today. ----------------------

  const roleFailures: string[] = [];
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
  if (!role) {
    roleFailures.push('could not read the application role attributes');
  } else {
    if (role.rolsuper) {
      roleFailures.push(`${role.current_user}: is a SUPERUSER, so it bypasses every RLS policy`);
    }
    if (role.rolbypassrls) {
      roleFailures.push(`${role.current_user}: has BYPASSRLS, so it bypasses every RLS policy`);
    }
  }

  // Owning a table also bypasses its policies unless the table forces RLS.
  if (role) {
    const owned = await db.execute<{ tablename: string; forced: boolean }>(sql`
      select c.relname as tablename, c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles o on o.oid = c.relowner
      where n.nspname = 'public' and c.relkind = 'r' and o.rolname = ${role.current_user}
    `);
    const needsPolicy = new Set(rlsEntries.map(([name]) => name));
    for (const row of owned.rows) {
      if (needsPolicy.has(row.tablename) && !row.forced) {
        roleFailures.push(
          `${row.tablename}: is owned by the application role and is not FORCE ROW LEVEL ` +
            'SECURITY, so the owner bypasses its policies',
        );
      }
    }
  }

  subchecks.push({
    name: 'application role attributes',
    failures: roleFailures,
    real: true,
    verdict: `${role?.current_user} is neither superuser nor BYPASSRLS, and owns no table that needs a policy`,
  });

  // ---- catalogue state, shared by the checks below ------------------------------------------

  const publicTables = await db.execute<{
    tablename: string;
    rowsecurity: boolean;
    forced: boolean;
  }>(sql`
    select c.relname as tablename,
           c.relrowsecurity as rowsecurity,
           c.relforcerowsecurity as forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  `);

  const inDatabase = new Map(publicTables.rows.map((r) => [r.tablename, r]));

  // ---- 3. the registry matches the catalogue, both directions. -------------------------------

  const catalogueFailures: string[] = [];
  for (const [name] of ENTRIES) {
    if (!inDatabase.has(name) && inDatabase.size > 0) {
      catalogueFailures.push(
        `${name}: classified in TABLE_ACCESS with no such table in the database. This is the ` +
          'direction ADR 0042 admitted it never checked',
      );
    }
  }
  for (const row of publicTables.rows) {
    const reason = TABLE_ACCESS_BLOCKERS[row.tablename as keyof typeof TABLE_ACCESS_BLOCKERS];
    if (reason) catalogueFailures.push(`${row.tablename}: migrated while blocked. ${reason}`);
    else if (!classified.has(row.tablename)) {
      catalogueFailures.push(
        `${row.tablename}: exists in the database and is not classified in TABLE_ACCESS`,
      );
    }
  }

  // A table carrying the tenant column and classified as anything else is the original mistake
  // ADR 0042's inventory existed to catch, and it survives the move to one registry: the column is
  // the strongest available hint that a table is tenant data, whatever its entry claims.
  const withWorkspaceId = await db.execute<{ table_name: string }>(sql`
    select table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'workspace_id'
  `);
  for (const row of withWorkspaceId.rows) {
    const access = REGISTRY[row.table_name];
    if (access && access.kind !== 'workspace-rls') {
      catalogueFailures.push(
        `${row.table_name}: carries a workspace_id column and is classified ${access.kind}, so ` +
          'tenant data is protected by something other than the tenancy boundary',
      );
    }
  }

  subchecks.push({
    name: 'registry to database catalogue',
    failures: catalogueFailures,
    real: inDatabase.size > 0,
    verdict:
      inDatabase.size > 0
        ? `${inDatabase.size} public table(s) matched against the registry in both directions`
        : 'there are no public tables yet, so neither direction had anything to iterate',
  });

  // ---- 4 and 5. the policy on each row-level-security table is exactly the canonical one. ----

  const policies = await db.execute<{
    tablename: string;
    polname: string;
    permissive: boolean;
    cmd: string;
    qual: string | null;
    withcheck: string | null;
    roles: string[];
  }>(sql`
    select c.relname as tablename,
           p.polname,
           p.polpermissive as permissive,
           p.polcmd as cmd,
           pg_get_expr(p.polqual, p.polrelid) as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as withcheck,
           -- ::text[] is load-bearing. array_agg over pg_roles.rolname yields name[], which
           -- node-postgres has no parser for, so the driver hands back the raw string '{convert_app}'
           -- and spreading it gives one entry per character. Caught by running this.
           coalesce((
             select array_agg(case when o = 0 then 'PUBLIC' else r.rolname end)::text[]
             from unnest(p.polroles) as o
             left join pg_roles r on r.oid = o
           ), '{}')::text[] as roles
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  `);

  for (const kind of RLS_KINDS) {
    const present = rlsEntries.filter(
      ([name, access]) => access.kind === kind && inDatabase.has(name),
    );
    const failures: string[] = [];

    if (present.length > 0) {
      const template = await deriveCanonicalQual(db, kind);

      for (const [name, access] of present) {
        const table = inDatabase.get(name);
        if (!table?.rowsecurity) failures.push(`${name}: row-level security is not enabled`);
        if (!table?.forced) {
          failures.push(
            `${name}: is not FORCE ROW LEVEL SECURITY, so a future ownership change reopens it`,
          );
        }

        const mine = policies.rows.filter((p) => p.tablename === name);
        const permissive = mine.filter((p) => p.permissive);
        if (permissive.length === 0) {
          failures.push(`${name}: row-level security is enabled but no permissive policy exists`);
          continue;
        }
        if (permissive.length > 1) {
          failures.push(
            `${name}: has ${permissive.length} permissive policies (${permissive
              .map((p) => p.polname)
              .join(', ')}). Permissive policies combine with OR, so a second one can only widen ` +
              'what is visible. Restrictive policies are fine; a second permissive one is not',
          );
          continue;
        }

        const policy = permissive[0]!;
        if (policy.cmd !== '*') {
          failures.push(
            `${name}: policy ${policy.polname} is not FOR ALL, so writes are governed by ` +
              'something other than the expression that governs reads',
          );
        }
        if (policy.withcheck !== null) {
          failures.push(
            `${name}: policy ${policy.polname} sets WITH CHECK. On a FOR ALL policy it must be ` +
              'omitted, so USING governs both visible and newly added rows and there is one ' +
              'expression to verify rather than two that can disagree',
          );
        }
        const roles = [...policy.roles].sort();
        if (roles.length !== 1 || roles[0] !== APP_ROLE) {
          failures.push(
            `${name}: policy ${policy.polname} applies to [${roles.join(', ')}] rather than ` +
              `exactly ${APP_ROLE}`,
          );
        }
        const expected = template.replaceAll('scope_id', access.scopeColumn);
        if (policy.qual !== expected) {
          failures.push(
            `${name}: policy ${policy.polname} is not the canonical expression.\n` +
              `      expected: ${expected}\n` +
              `      actual:   ${policy.qual}`,
          );
        }
      }
    }

    subchecks.push({
      name: `${kind} policies`,
      failures,
      real: present.length > 0,
      verdict:
        present.length > 0
          ? `${present.length} table(s) carry exactly the canonical ${SCOPE_GUC[kind]} policy`
          : `no ${kind} table exists yet, so no ${SCOPE_GUC[kind]} policy was demanded`,
    });
  }

  // ---- 6. grant-only tables hold exactly the privileges they declare. ------------------------

  const grantEntries = ENTRIES.filter(
    (entry): entry is [string, TableAccess & { kind: 'role-grants' }] =>
      entry[1].kind === 'role-grants',
  );
  const presentGrants = grantEntries.filter(([name]) => inDatabase.has(name));
  const grantFailures: string[] = [];

  if (presentGrants.length > 0) {
    const grants = await db.execute<{
      table_name: string;
      grantee: string;
      privilege_type: string;
    }>(sql`
      select table_name, grantee, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
    `);

    for (const [name, access] of presentGrants) {
      const rows = grants.rows.filter((g) => g.table_name === name);

      for (const row of rows) {
        if (row.grantee === 'PUBLIC') {
          grantFailures.push(
            `${name}: ${row.privilege_type} is granted to PUBLIC, which every role holds`,
          );
        }
        // Only what the application role or PUBLIC holds. The owner holds TRUNCATE, REFERENCES and
        // TRIGGER inherently - they come with owning the table, not from a grant - so flagging them
        // would fail every table on a rule about a role that runs migrations anyway.
        const reachesApp = row.grantee === APP_ROLE || row.grantee === 'PUBLIC';
        if (
          reachesApp &&
          (FORBIDDEN_PRIVILEGES as readonly string[]).includes(row.privilege_type)
        ) {
          grantFailures.push(
            `${name}: ${row.privilege_type} is granted to ${row.grantee}. Row-level security does ` +
              'not govern it - TRUNCATE never visits a row, REFERENCES probes for rows a policy ' +
              'hides, TRIGGER runs code - so the grant is the only control',
          );
        }
      }

      const actual = [
        ...new Set(rows.filter((g) => g.grantee === APP_ROLE).map((g) => g.privilege_type)),
      ].sort();
      const declared = [...access.appPrivileges].sort();
      if (actual.join(',') !== declared.join(',')) {
        grantFailures.push(
          `${name}: ${APP_ROLE} holds [${actual.join(', ')}] where the registry declares ` +
            `[${declared.join(', ')}]`,
        );
      }

      if (inDatabase.get(name)?.rowsecurity) {
        grantFailures.push(
          `${name}: is classified role-grants and has row-level security enabled. Grants control ` +
            'operations, never row visibility - a table needing row scoping cannot be role-grants',
        );
      }
    }
  }

  subchecks.push({
    name: 'role-grants privileges',
    failures: grantFailures,
    real: presentGrants.length > 0,
    verdict:
      presentGrants.length > 0
        ? `${presentGrants.length} grant-only table(s) hold exactly their declared privileges`
        : `no grant-only table exists in the database yet (${grantEntries.length} declared), so no privilege was compared`,
  });

  // ---- 7. does isolation actually hold? Behavioural, on a fixture table. ---------------------
  //
  // The checks above are necessary and not sufficient: they prove the role *could* be subject to
  // policy and that a policy reads as intended, not that a cross-tenant read returns nothing. This
  // proves it, on a fixture table this script creates and drops, so it does not wait for the first
  // migration and does not care what the real schema looks like.
  //
  // The control matters as much as the test: the owner must see BOTH rows. Without that, an empty
  // result could mean isolation works or could mean the query was simply wrong, and a test that
  // cannot fail is not a test.

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
    // Written by canonicalPolicySql so the probe proves the same policy a migration would write,
    // rather than a hand-typed lookalike. The nullif inside it is load-bearing: without it an empty
    // context raises invalid input syntax for uuid instead of returning no rows, so a forgotten
    // context becomes a 500 rather than an empty list. Verified against Postgres 16 on 21 Aug 2026.
    await db.execute(sql.raw(canonicalPolicySql('rls_probe', 'workspace-rls', 'workspace_id')));
    await db.execute(sql`grant select, insert, update, delete on rls_probe to convert_app`);
    await db.execute(sql`grant usage, select on sequence rls_probe_id_seq to convert_app`);
    await db.execute(sql`
      insert into rls_probe (workspace_id, note)
      values (${A}::uuid, 'belongs to A'), (${B}::uuid, 'belongs to B')
    `);

    const asApp = async (workspaceId: string | null) =>
      appDb.transaction(async (tx) => {
        await tx.execute(
          workspaceId === null
            ? sql`select set_config('app.current_workspace', '', true)`
            : sql`select set_config('app.current_workspace', ${workspaceId}, true)`,
        );
        const rows = await tx.execute<{ note: string }>(sql`select note from rls_probe`);
        return rows.rows.map((r) => r.note).sort();
      });

    const seenA = await asApp(A);
    if (seenA.length !== 1 || seenA[0] !== 'belongs to A') {
      isolation.push(
        `workspace A context returned ${JSON.stringify(seenA)}, expected only A's row`,
      );
    }

    const seenB = await asApp(B);
    if (seenB.length !== 1 || seenB[0] !== 'belongs to B') {
      isolation.push(
        `workspace B context returned ${JSON.stringify(seenB)}, expected only B's row`,
      );
    }

    // A forgotten context must leak nothing, rather than everything.
    const seenNone = await asApp(null);
    if (seenNone.length !== 0) {
      isolation.push(
        `an empty workspace context returned ${JSON.stringify(seenNone)}, expected nothing`,
      );
    }

    // And an explicit attempt to read across tenants must come back empty.
    const cross = await appDb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.current_workspace', ${A}, true)`);
      return tx.execute<{ note: string }>(
        sql`select note from rls_probe where workspace_id = ${B}::uuid`,
      );
    });
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

  subchecks.push({
    name: 'cross-tenant isolation',
    failures: isolation,
    real: true,
    verdict:
      'a cross-tenant read returned nothing, an empty context returned nothing, and the owner ' +
      'saw both rows',
  });

  // ---- report ------------------------------------------------------------------------------

  const failed = subchecks.filter((check) => check.failures.length > 0);
  if (failed.length > 0) {
    console.error('RLS assertion failed:\n');
    for (const check of failed) {
      console.error(`  ${check.name}:`);
      for (const failure of check.failures) console.error(`    ${failure}`);
    }
    console.error(
      '\nSee docs/adr/0050-one-table-access-registry-classified-by-what-the-gate-demands.md',
    );
    process.exit(1);
  }

  console.warn('RLS ok. What each check proved, and what it did not:\n');
  for (const check of subchecks) {
    console.warn(`  [${check.real ? 'real   ' : 'vacuous'}] ${check.name}: ${check.verdict}`);
  }
  if (subchecks.some((check) => !check.real)) {
    console.warn(
      '\nThe vacuous checks above are not passes. They report that the schema they exist to check ' +
        'does not exist yet, and they become real with the first migration (ADR 0048).',
    );
  }
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
