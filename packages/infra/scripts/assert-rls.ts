import { getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { createDatabase } from '../src/db/client';
import type { Database } from '../src/db/client';
import {
  APP_ROLE,
  CLASSIFIABLE_RELKINDS,
  FORBIDDEN_PRIVILEGES,
  IDENTIFIER,
  SCOPE_GUC,
  TABLE_ACCESS,
  TABLE_ACCESS_BLOCKERS,
  TENANT_KEY,
  TENANT_TABLE,
  VIEW_OPTION,
  canonicalPolicySql,
} from '../src/db/access';
import type { TableAccess } from '../src/db/access';
import * as schema from '../src/db/schema';

/**
 * Gate G7, the assertion half. Nine checks, reported one line each and tagged real or vacuous.
 *
 * They become real at different moments, and a single verdict would let the vacuous ones pass for
 * proven (ADR 0048). Three are real with no migrations: the application role's attributes, every
 * declared Drizzle table being classified, and the behavioural isolation probe. The other six need
 * a public table and say so in their own line.
 *
 * The registry the checks read is `src/db/access.ts` (ADR 0050).
 *
 * Six of the checks exist because two independent reviews took the first version of this file
 * apart, and every hole they found was a real, unprotected table passing green:
 *
 *   - **Foreign keys, not column names.** `role-grants` was policed by looking for a column called
 *     `workspace_id`. A child table with an FK to tenant data and no such column of its own -
 *     `lead_note` with a `lead_id` - passed with a `reason` a reviewer would accept, and returned
 *     every tenant's rows. Reachability is a property of the schema graph, so the graph gets read.
 *   - **Views must set `security_invoker`, and a materialized view may not read tenant data.** They
 *     are not `relkind = 'r'`, so the original queries could not see them at all, and both were
 *     demonstrated returning a full tenant table. A view runs with its owner's rights unless the
 *     option is set, and migrations run as the owner; a materialized view is never subject to RLS,
 *     so no option saves it and the dependency graph is what refuses it (ADR 0051).
 *   - **Partitioned parents are 'p', not 'r'.** A partitioned tenant table with grants and no RLS
 *     passed while the gate printed "there are no public tables yet". Partitions inherit their
 *     root's entry and are held to the same rules, because reading a partition directly applies
 *     that partition's policies rather than its parent's.
 *   - **Privileges are read with `has_table_privilege` and `has_any_column_privilege`**, not
 *     `information_schema.role_table_grants`, which shows neither column-level grants nor anything
 *     inherited through a group role. `grant select (name) on workspace to convert_app` was
 *     invisible while the entry declared no privileges at all.
 *   - **TRUNCATE, REFERENCES and TRIGGER are checked on every class** - they used to be checked
 *     everywhere except the tables that hold tenant data.
 *   - **`scopeColumn` is verified against the catalogue**: it must exist, be a NOT NULL `uuid`, and
 *     either reference `workspace(id)` or be it. A policy on `created_by_id` is canonical in shape
 *     and isolates by the wrong axis.
 *
 * Two things about the design are worth knowing before changing anything.
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

/** Narrows the entry, not just its tag, so `scopeColumn` is reachable after the check. */
type RlsAccess = Extract<TableAccess, { kind: RlsKind }>;
const isRlsAccess = (access: TableAccess): access is RlsAccess =>
  (RLS_KINDS as readonly string[]).includes(access.kind);

/**
 * Every table declared in `schema.ts`, found by asking Drizzle rather than by keeping a list.
 * A new table joins this check by existing, which is the only way a coverage check stays honest.
 */
const declaredTables = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableName(table))
  .sort();

type Relation = {
  relname: string;
  relkind: string;
  rowsecurity: boolean;
  forced: boolean;
  owner: string;
  root: string;
  isPartition: boolean;
  /** `reloptions`, which is where a view records `security_invoker` (ADR 0051). */
  options: string[] | null;
};

type ForeignKey = {
  child: string;
  parent: string;
  columns: string[];
  parentColumns: string[];
  notNull: boolean;
  isUuid: boolean;
};

type Column = { relname: string; column: string; type: string; notNull: boolean };

/**
 * The canonical policy expression for a class and column, as this Postgres prints it.
 *
 * Derived rather than hardcoded. `pg_get_expr` output is formatting-sensitive - casts get spelled
 * out, literals get `::text`, operands of OR get their own parentheses - so pinning a string would
 * mean a server upgrade failing a policy that is in fact correct. The script writes the canonical
 * policy itself, on a throwaway table, with the same column the real table uses, and reads back the
 * printed form. Nothing is substituted into the result afterwards, which is what the first version
 * did.
 *
 * Substring matching was rejected outright: a check that `true or workspace_id = nullif(...)` passes
 * is not a check (ADR 0050).
 */
const deriveCanonicalQual = async (
  db: Database,
  kind: RlsKind,
  scopeColumn: string,
): Promise<string> => {
  const probe = `rls_expr_probe_${kind.replace('-', '_')}`;
  if (!IDENTIFIER.test(probe)) throw new Error(`probe name ${probe} is not an identifier`);
  if (!IDENTIFIER.test(scopeColumn)) throw new Error(`${scopeColumn} is not an identifier`);

  // Never drop blindly. The first version opened with `drop table if exists`, which would have
  // deleted a real table that happened to carry this name.
  const clash = await db.execute<{ ok: boolean }>(sql`
    select true as ok
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = ${probe}
  `);
  if (clash.rows.length > 0) {
    throw new Error(
      `${probe} already exists in the public schema. That is this script's fixture name, so ` +
        'either a previous run died before dropping it or a migration has claimed the name. ' +
        'Inspect it rather than letting the gate drop it.',
    );
  }

  try {
    await db.execute(sql.raw(`create table public.${probe} (${scopeColumn} uuid not null)`));
    await db.execute(sql.raw(`alter table public.${probe} enable row level security`));
    await db.execute(sql.raw(canonicalPolicySql(`public.${probe}`, kind, scopeColumn)));
    const printed = await db.execute<{ qual: string }>(sql`
      select pg_get_expr(p.polqual, p.polrelid) as qual
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = ${probe}
    `);
    const qual = printed.rows[0]?.qual;
    if (!qual) throw new Error(`could not derive the canonical ${kind} expression`);
    return qual;
  } finally {
    // In a finally, so a throw between create and read cannot leave the fixture behind to be
    // reported as an unclassified table on the next run.
    await db.execute(sql.raw(`drop table if exists public.${probe}`));
  }
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

  // ---- 1. registry hygiene, and every declared table classified. Real today. -----------------

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
    if (!IDENTIFIER.test(name)) {
      classification.push(`${name}: registry key is not a bare SQL identifier`);
    }
  }

  for (const [name, access] of ENTRIES) {
    if (access.kind === 'role-grants' && access.reason.trim() === '') {
      classification.push(
        `${name}: role-grants with a blank reason. TypeScript's string admits '', and an ` +
          'unexplained absence of a policy is what ADR 0050 exists to stop reading as a decision',
      );
    }
    if (isRlsAccess(access) && !IDENTIFIER.test(access.scopeColumn)) {
      classification.push(
        `${name}: scopeColumn ${JSON.stringify(access.scopeColumn)} is not a bare SQL ` +
          'identifier, and it reaches create policy as text',
      );
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

  // The owner half, which nothing asserted until ADR 0052. A migration operates on every tenant's
  // rows by definition, so a boundary built to scope one tenant's requests must not apply to it -
  // and every row-scoped table is FORCE ROW LEVEL SECURITY, which removes the owner's exemption. An
  // ordinary owner therefore turns a backfill into `UPDATE 0` that reports success, which under
  // forward-only migrations is the worst available failure. Measured, not theorised.
  const owner = await db.execute<{
    current_user: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
  }>(sql`
    select current_user, r.rolsuper, r.rolbypassrls
    from pg_roles r
    where r.rolname = current_user
  `);
  const ownerRole = owner.rows[0];
  if (!ownerRole) {
    roleFailures.push('could not read the migration owner role attributes');
  } else {
    if (!ownerRole.rolsuper && !ownerRole.rolbypassrls) {
      roleFailures.push(
        `${ownerRole.current_user}: is the migration owner and can neither bypass RLS nor is a ` +
          'superuser. Every row-scoped table forces RLS, so a data migration running as this role ' +
          'sees no rows and a backfill becomes UPDATE 0 reporting success. Grant BYPASSRLS ' +
          'deliberately and record it (ADR 0052)',
      );
    }
    if (role && ownerRole.current_user === role.current_user) {
      roleFailures.push(
        `${ownerRole.current_user}: DATABASE_URL and DATABASE_URL_APP are the same role, which ` +
          'collapses the split ADR 0042 exists to create',
      );
    }
  }

  // Attributes and privileges both reach a role through membership, so an inherited path from the
  // application role to the owner hands the application the bypass ADR 0052 grants the owner. This
  // is the case that would otherwise pass every other check.
  if (role && ownerRole) {
    const membership = await db.execute<{ path: string }>(sql`
      with recursive climb(oid, path) as (
        select r.oid, r.rolname::text
        from pg_roles r
        where r.rolname = ${role.current_user}
        union all
        select parent.oid, climb.path || ' -> ' || parent.rolname
        from climb
        join pg_auth_members m on m.member = climb.oid
        join pg_roles parent on parent.oid = m.roleid
      )
      select path from climb where oid = (select oid from pg_roles where rolname = ${ownerRole.current_user})
    `);
    for (const row of membership.rows) {
      roleFailures.push(
        `${role.current_user} is a member of the migration owner (${row.path}), so it inherits ` +
          'that role and with it the ability to bypass every policy',
      );
    }
  }

  // A default privilege granting table rights to the application role defeats the registry for
  // every table a later migration creates. Deleting the ALTER DEFAULT PRIVILEGES statement from
  // bootstrap.sql does not undo one already installed in an existing database - that needs an
  // explicit REVOKE - so the catalogue state is asserted rather than assumed.
  const defaults = await db.execute<{ schema: string; grantee: string; privilege: string }>(sql`
    select n.nspname as schema,
           coalesce(pg_get_userbyid(a.grantee), 'PUBLIC') as grantee,
           a.privilege_type as privilege
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) as a
    where d.defaclobjtype = 'r'
  `);
  for (const row of defaults.rows) {
    if (row.grantee === APP_ROLE || row.grantee === 'PUBLIC') {
      roleFailures.push(
        `default privileges in schema ${row.schema} grant ${row.privilege} on future tables to ` +
          `${row.grantee}, so every table a migration creates holds it whatever TABLE_ACCESS ` +
          `declares. Revoke it: alter default privileges in schema ${row.schema} revoke ` +
          `${row.privilege} on tables from ${row.grantee}`,
      );
    }
  }

  subchecks.push({
    name: 'database roles',
    failures: roleFailures,
    real: true,
    verdict:
      `${role?.current_user} is neither superuser nor BYPASSRLS and is not a member of the owner; ` +
      `${ownerRole?.current_user} can bypass RLS as ADR 0052 requires; no default privilege ` +
      'grants rights on future tables',
  });

  // The roles are a precondition, not one finding among nine, so this reports and stops rather than
  // collecting. Everything below assumes the owner can act on every row and the application role
  // cannot: with a non-bypassing owner the isolation probe cannot even insert its own fixture rows,
  // and it died with a bare Postgres 42501 that named none of this - the diagnosis above was
  // already in hand and was never printed. Found by pointing DATABASE_URL at an ordinary role.
  if (roleFailures.length > 0) {
    console.error('RLS assertion failed on the database roles, so nothing after it was run:\n');
    for (const failure of roleFailures) console.error(`  ${failure}`);
    console.error(
      '\nEvery later check assumes the owner can reach every row and the application role cannot.' +
        '\nSee docs/adr/0052-the-migration-owner-bypasses-row-level-security.md',
    );
    process.exit(1);
  }

  // ---- catalogue state, shared by everything below -------------------------------------------
  //
  // The `rls\_%` exclusion keeps this script's own fixtures out of the picture. They are created
  // and dropped inside it, and a concurrent run would otherwise see them.

  const relations = await db.execute<Relation>(sql`
    select c.relname,
           c.relkind,
           c.relrowsecurity as rowsecurity,
           c.relforcerowsecurity as forced,
           o.rolname as owner,
           coalesce(rt.relname, c.relname) as root,
           c.relispartition as "isPartition",
           c.reloptions::text[] as options
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_roles o on o.oid = c.relowner
    left join pg_class rt on rt.oid = pg_partition_root(c.oid)
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and c.relname not like 'rls\_%'
  `);

  const tables = relations.rows.filter((r) =>
    (CLASSIFIABLE_RELKINDS as readonly string[]).includes(r.relkind),
  );
  const inDatabase = new Map(tables.map((r) => [r.relname, r]));

  /**
   * The registry entry governing a relation. A partition has no entry of its own - it inherits its
   * root's, and is then held to the same rules, because selecting from a partition directly applies
   * that partition's policies rather than the parent's.
   */
  const entryFor = (t: Relation): TableAccess | undefined =>
    REGISTRY[t.isPartition ? t.root : t.relname];

  const columns = await db.execute<Column>(sql`
    select c.relname,
           a.attname as column,
           t.typname as type,
           a.attnotnull as "notNull"
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attnum > 0
      and not a.attisdropped
  `);

  const foreignKeys = await db.execute<ForeignKey>(sql`
    select src.relname as child,
           tgt.relname as parent,
           (select array_agg(a.attname order by a.attnum)::text[]
              from pg_attribute a
             where a.attrelid = src.oid and a.attnum = any (con.conkey)) as columns,
           (select array_agg(a.attname order by a.attnum)::text[]
              from pg_attribute a
             where a.attrelid = tgt.oid and a.attnum = any (con.confkey)) as "parentColumns",
           (select bool_and(a.attnotnull)
              from pg_attribute a
             where a.attrelid = src.oid and a.attnum = any (con.conkey)) as "notNull",
           (select bool_and(t.typname = 'uuid')
              from pg_attribute a
              join pg_type t on t.oid = a.atttypid
             where a.attrelid = src.oid and a.attnum = any (con.conkey)) as "isUuid"
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class tgt on tgt.oid = con.confrelid
    join pg_namespace n on n.oid = src.relnamespace
    where con.contype = 'f' and n.nspname = 'public'
  `);

  // ---- 3. ownership. Real only once a table exists that needs a policy. ----------------------

  const ownershipFailures: string[] = [];
  const ownedNeedingPolicy = tables.filter((t) => {
    const access = entryFor(t);
    return t.owner === role?.current_user && access !== undefined && isRlsAccess(access);
  });
  for (const t of ownedNeedingPolicy) {
    if (!t.forced) {
      ownershipFailures.push(
        `${t.relname}: is owned by the application role and is not FORCE ROW LEVEL SECURITY, so ` +
          'the owner bypasses its policies',
      );
    }
  }

  subchecks.push({
    name: 'table ownership',
    failures: ownershipFailures,
    real: ownedNeedingPolicy.length > 0,
    verdict:
      ownedNeedingPolicy.length > 0
        ? `${ownedNeedingPolicy.length} table(s) owned by the application role force RLS`
        : `${APP_ROLE} owns no table that needs a policy, so there was nothing to check. ADR ` +
          '0042 named this check as real today; it has never had anything to iterate',
  });

  // ---- 4. the registry matches the catalogue, both directions. --------------------------------

  const catalogueFailures: string[] = [];

  for (const relation of relations.rows) {
    if ((CLASSIFIABLE_RELKINDS as readonly string[]).includes(relation.relkind)) continue;
    catalogueFailures.push(
      `${relation.relname}: is relkind ${relation.relkind}, which TABLE_ACCESS does not model. A ` +
        'foreign table holds data this database cannot police, so it needs a decision rather than ' +
        'a registry entry',
    );
  }

  // Views and materialized views (ADR 0051). A view is safe when it reads its base tables as the
  // invoking role, which is what security_invoker does; without it a view reads them as its owner,
  // and migrations run as the owner. Measured on Postgres 16.13: a plain view over a policed table
  // returned every tenant's rows where the table returned one.
  const views = relations.rows.filter((r) => r.relkind === 'v' || r.relkind === 'm');
  for (const view of views) {
    const access = REGISTRY[view.relname];
    if (access && access.kind !== 'view') {
      catalogueFailures.push(
        `${view.relname}: is a ${view.relkind === 'v' ? 'view' : 'materialized view'} classified ` +
          `${access.kind}. Only the view class describes one`,
      );
    }
    if (view.relkind === 'v' && !(view.options ?? []).includes(VIEW_OPTION)) {
      catalogueFailures.push(
        `${view.relname}: is a view without ${VIEW_OPTION}, so it reads its base tables as its ` +
          'owner rather than as the invoking role, and every policy on them is bypassed. Add ' +
          `with (${VIEW_OPTION}) - required on every view, whatever it selects from (ADR 0051)`,
      );
    }
  }

  // A materialized view cannot be made safe: row-level security is never applied when reading one,
  // because the rows were computed at refresh time. So it must not be able to read row-scoped data,
  // and the dependency graph answers that rather than the definition looking harmless.
  if (views.some((v) => v.relkind === 'm')) {
    const reads = await db.execute<{ viewname: string; base: string }>(sql`
      select distinct dependent.relname as viewname, base.relname as base
      from pg_depend d
      join pg_rewrite r on r.oid = d.objid
      join pg_class dependent on dependent.oid = r.ev_class
      join pg_class base on base.oid = d.refobjid
      join pg_namespace n on n.oid = dependent.relnamespace
      where d.classid = 'pg_rewrite'::regclass
        and d.refclassid = 'pg_class'::regclass
        and dependent.oid <> base.oid
        and dependent.relkind = 'm'
        and n.nspname = 'public'
    `);
    for (const row of reads.rows) {
      const baseAccess = REGISTRY[row.base];
      if (baseAccess && isRlsAccess(baseAccess)) {
        catalogueFailures.push(
          `${row.viewname}: is a materialized view reading ${row.base}, which is ` +
            `${baseAccess.kind}. Row-level security is never applied when reading a materialized ` +
            'view, and no option changes that, so its contents are readable in full by anyone ' +
            'holding SELECT on it. A real table maintained by the worker, with its own policy, is ' +
            'the replacement (ADR 0051)',
        );
      }
    }
  }

  for (const [name] of ENTRIES) {
    if (!inDatabase.has(name) && inDatabase.size > 0) {
      catalogueFailures.push(
        `${name}: classified in TABLE_ACCESS with no such table in the database. This is the ` +
          'direction ADR 0042 admitted it never checked',
      );
    }
  }
  for (const t of tables) {
    const reason = TABLE_ACCESS_BLOCKERS[t.root as keyof typeof TABLE_ACCESS_BLOCKERS];
    if (reason) catalogueFailures.push(`${t.relname}: migrated while blocked. ${reason}`);
    else if (!entryFor(t)) {
      catalogueFailures.push(
        `${t.relname}: exists in the database and is not classified in TABLE_ACCESS` +
          (t.isPartition ? ` (nor is its partition root ${t.root})` : ''),
      );
    }
  }

  subchecks.push({
    name: 'registry to database catalogue',
    failures: catalogueFailures,
    real: relations.rows.length > 0,
    verdict:
      relations.rows.length > 0
        ? `${relations.rows.length} relation(s) in public, all of them tables, all classified`
        : 'there is nothing in the public schema yet, so neither direction had anything to iterate',
  });

  // ---- 5. the tenancy graph. What can reach tenant data, by foreign key. ----------------------
  //
  // This replaces a string match on the column name `workspace_id`, which could not see a child
  // table holding tenant data through its parent - the shape review found leaking. `lead_note`
  // with a `lead_id` classified itself role-grants, with a plausible reason, and returned every
  // tenant's rows.

  const graphFailures: string[] = [];

  // (a) a NOT NULL uuid foreign key to workspace(id) means the table is tenant data, whatever its
  //     column is called and whatever its entry claims.
  for (const fk of foreignKeys.rows) {
    if (fk.parent !== TENANT_TABLE) continue;
    if (fk.parentColumns.length !== 1 || fk.parentColumns[0] !== TENANT_KEY) continue;
    if (!fk.notNull || !fk.isUuid || fk.columns.length !== 1) continue;
    const access = REGISTRY[fk.child];
    if (!access) continue;
    if (access.kind !== 'workspace-rls') {
      graphFailures.push(
        `${fk.child}: has a NOT NULL uuid foreign key ${fk.columns[0]} to ` +
          `${TENANT_TABLE}(${TENANT_KEY}) and is classified ${access.kind}. That is tenant data ` +
          'protected by something other than the tenancy boundary',
      );
    } else if (access.scopeColumn !== fk.columns[0]) {
      graphFailures.push(
        `${fk.child}: scopes by ${access.scopeColumn} while its tenant foreign key is ` +
          `${fk.columns[0]}. A policy on the wrong column is canonical in shape and isolates by ` +
          'the wrong axis',
      );
    }
  }

  // (b) a role-grants table must not be able to reach tenant data at all. Transitive, because the
  //     leaking shape was two hops from a policy.
  const parentsOf = new Map<string, string[]>();
  for (const fk of foreignKeys.rows) {
    parentsOf.set(fk.child, [...(parentsOf.get(fk.child) ?? []), fk.parent]);
  }
  const pathToTenantData = (from: string): string[] | null => {
    const seen = new Set<string>([from]);
    const queue: { table: string; path: string[] }[] = [{ table: from, path: [from] }];
    while (queue.length > 0) {
      const { table, path } = queue.shift()!;
      for (const parent of parentsOf.get(table) ?? []) {
        if (seen.has(parent)) continue;
        seen.add(parent);
        const access = REGISTRY[parent];
        if (parent === TENANT_TABLE || (access && access.kind === 'workspace-rls')) {
          return [...path, parent];
        }
        queue.push({ table: parent, path: [...path, parent] });
      }
    }
    return null;
  };

  for (const [name, access] of ENTRIES) {
    if (access.kind !== 'role-grants') continue;
    if (!inDatabase.has(name)) continue;
    const path = pathToTenantData(name);
    if (path) {
      graphFailures.push(
        `${name}: is classified role-grants and reaches tenant data by foreign key ` +
          `(${path.join(' -> ')}). Grants control operations, never row visibility, so every row ` +
          'of it is readable by the application whatever its reason says. It needs a policy of ' +
          'its own, or a tenant column to scope by',
      );
    }
  }

  // (c) a row-scoped table's scope column has to be what it claims to be.
  for (const [name, access] of ENTRIES) {
    if (!isRlsAccess(access)) continue;
    if (!inDatabase.has(name)) continue;
    const column = columns.rows.find((c) => c.relname === name && c.column === access.scopeColumn);
    if (!column) {
      graphFailures.push(`${name}: scopeColumn ${access.scopeColumn} does not exist on the table`);
      continue;
    }
    if (column.type !== 'uuid') {
      graphFailures.push(
        `${name}: scopeColumn ${access.scopeColumn} is ${column.type}, not uuid, so the policy's ` +
          'uuid cast is comparing something else',
      );
    }
    if (!column.notNull) {
      graphFailures.push(
        `${name}: scopeColumn ${access.scopeColumn} is nullable. A null never equals the ` +
          'context, so such a row is unreachable rather than protected',
      );
    }
    if (access.kind === 'workspace-rls') {
      const isTenantKeyItself = name === TENANT_TABLE && access.scopeColumn === TENANT_KEY;
      const hasTenantFk = foreignKeys.rows.some(
        (fk) =>
          fk.child === name &&
          fk.parent === TENANT_TABLE &&
          fk.columns.length === 1 &&
          fk.columns[0] === access.scopeColumn,
      );
      if (!isTenantKeyItself && !hasTenantFk) {
        graphFailures.push(
          `${name}: scopeColumn ${access.scopeColumn} neither references ` +
            `${TENANT_TABLE}(${TENANT_KEY}) nor is it, so nothing ties the value the policy ` +
            'compares to a real workspace',
        );
      }
    }
  }

  subchecks.push({
    name: 'tenancy graph',
    failures: graphFailures,
    real: inDatabase.size > 0,
    verdict:
      inDatabase.size > 0
        ? `${foreignKeys.rows.length} foreign key(s) walked; no grant-only table reaches tenant data`
        : 'there are no tables yet, so there is no graph to walk',
  });

  // ---- 6 and 7. the policy on each row-scoped table is exactly the canonical one. -------------

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
           -- node-postgres has no parser for, so the driver hands back the raw string
           -- '{convert_app}' and spreading it gives one entry per character.
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
    const present = tables.filter((t) => {
      const access = entryFor(t);
      return access !== undefined && access.kind === kind;
    });
    const failures: string[] = [];

    for (const table of present) {
      const access = entryFor(table);
      if (!access || !isRlsAccess(access)) continue;
      const name = table.relname;
      const label = table.isPartition ? `${name} (partition of ${table.root})` : name;

      if (!table.rowsecurity) failures.push(`${label}: row-level security is not enabled`);
      if (!table.forced) {
        failures.push(
          `${label}: is not FORCE ROW LEVEL SECURITY, so a future ownership change reopens it`,
        );
      }

      const mine = policies.rows.filter((p) => p.tablename === name);
      const permissive = mine.filter((p) => p.permissive);
      if (permissive.length === 0) {
        failures.push(`${label}: row-level security is enabled but no permissive policy exists`);
        continue;
      }
      if (permissive.length > 1) {
        failures.push(
          `${label}: has ${permissive.length} permissive policies (${permissive
            .map((p) => p.polname)
            .join(', ')}). Permissive policies combine with OR, so a second one can only widen ` +
            'what is visible. Restrictive policies are fine; a second permissive one is not',
        );
        continue;
      }

      const policy = permissive[0]!;
      if (policy.cmd !== '*') {
        failures.push(
          `${label}: policy ${policy.polname} is not FOR ALL, so writes are governed by ` +
            'something other than the expression that governs reads',
        );
      }
      if (policy.withcheck !== null) {
        failures.push(
          `${label}: policy ${policy.polname} sets WITH CHECK. On a FOR ALL policy it must be ` +
            'omitted, so USING governs both visible and newly added rows and there is one ' +
            'expression to verify rather than two that can disagree',
        );
      }
      const roles = [...policy.roles].sort();
      if (roles.length !== 1 || roles[0] !== APP_ROLE) {
        failures.push(
          `${label}: policy ${policy.polname} applies to [${roles.join(', ')}] rather than ` +
            `exactly ${APP_ROLE}`,
        );
      }
      const expected = await deriveCanonicalQual(db, kind, access.scopeColumn);
      if (policy.qual !== expected) {
        failures.push(
          `${label}: policy ${policy.polname} is not the canonical expression.\n` +
            `      expected: ${expected}\n` +
            `      actual:   ${policy.qual}`,
        );
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

  // ---- 8. every table holds exactly the privileges its entry declares. ------------------------
  //
  // Read with has_table_privilege and has_any_column_privilege rather than
  // information_schema.role_table_grants. That view shows only table-level grants, and only where
  // the grantor or grantee is a currently enabled role - so it misses column grants and anything
  // inherited through a group role, both of which are real access.

  const grantFailures: string[] = [];
  if (inDatabase.size > 0) {
    const effective = await db.execute<{
      relname: string;
      privilege: string;
      on_table: boolean;
      on_column: boolean;
      public_on_table: boolean;
    }>(sql`
      select c.relname,
             p.priv as privilege,
             has_table_privilege(${APP_ROLE}, c.oid, p.priv) as on_table,
             case
               when p.priv in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
                 then has_any_column_privilege(${APP_ROLE}, c.oid, p.priv)
               else false
             end as on_column,
             exists (
               select 1
               from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
               where acl.grantee = 0 and acl.privilege_type = p.priv
             ) as public_on_table
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join unnest(array[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]) as p(priv)
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm')
        and c.relname not like 'rls\_%'
    `);

    for (const table of tables) {
      const access = entryFor(table);
      if (!access) continue; // already reported as unclassified by check 4
      const name = table.relname;
      const label = table.isPartition ? `${name} (partition of ${table.root})` : name;
      const rows = effective.rows.filter((r) => r.relname === name);

      for (const row of rows) {
        if ((FORBIDDEN_PRIVILEGES as readonly string[]).includes(row.privilege)) {
          if (row.on_table || row.on_column) {
            grantFailures.push(
              `${label}: ${APP_ROLE} holds ${row.privilege}. Row-level security does not govern ` +
                'it - TRUNCATE never visits a row, REFERENCES probes for rows a policy hides, ' +
                'TRIGGER runs code - so the grant is the only control and it must not exist',
            );
          }
          continue;
        }
        if (row.public_on_table) {
          grantFailures.push(
            `${label}: ${row.privilege} is granted to PUBLIC, which every role holds`,
          );
        }
        if (row.on_column && !row.on_table) {
          grantFailures.push(
            `${label}: ${APP_ROLE} holds ${row.privilege} on a column but not on the table. A ` +
              'column grant is real access that information_schema.role_table_grants does not ' +
              'show, and TABLE_ACCESS does not model it - grant at table level or not at all',
          );
        }
      }

      const held = rows
        .filter(
          (r) =>
            (r.on_table || r.on_column) &&
            !(FORBIDDEN_PRIVILEGES as readonly string[]).includes(r.privilege),
        )
        .map((r) => r.privilege)
        .sort();
      const declared = [...access.appPrivileges].sort();
      if (table.isPartition) {
        // A partition is held to "no more than its root declares", not to an exact match. Grants on
        // a partitioned parent do not reach its partitions for direct access, so requiring the
        // parent's set on every partition would push a migration into granting more than the
        // application needs - the opposite of the point. Holding *extra* is still a finding.
        const extra = held.filter((p) => !declared.includes(p as never));
        if (extra.length > 0) {
          grantFailures.push(
            `${label}: ${APP_ROLE} effectively holds [${extra.join(', ')}] which its partition ` +
              `root does not declare (root declares [${declared.join(', ')}])`,
          );
        }
      } else if (held.join(',') !== declared.join(',')) {
        grantFailures.push(
          `${label}: ${APP_ROLE} effectively holds [${held.join(', ')}] where the registry ` +
            `declares [${declared.join(', ')}]. Effective means direct, inherited through a ` +
            'group role, granted to PUBLIC, or granted on a single column',
        );
      }

      if (access.kind === 'role-grants' && table.rowsecurity) {
        grantFailures.push(
          `${label}: is classified role-grants and has row-level security enabled. Grants control ` +
            'operations, never row visibility - a table needing row scoping cannot be role-grants',
        );
      }
    }
  }

  subchecks.push({
    name: 'effective privileges',
    failures: grantFailures,
    real: inDatabase.size > 0,
    verdict:
      inDatabase.size > 0
        ? `${inDatabase.size} table(s) hold exactly their declared privileges, with no column ` +
          'grant, no PUBLIC grant and none of TRUNCATE, REFERENCES or TRIGGER'
        : `there are no public tables yet (${ENTRIES.length} classified), so no privilege was compared`,
  });

  // ---- 9. does isolation actually hold? Behavioural, on a fixture table. ---------------------
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
    // Written by canonicalPolicySql so the probe proves the same policy text a migration has to
    // reproduce, rather than a hand-typed lookalike.
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

  const real = subchecks.filter((check) => check.real).length;
  console.warn(
    `RLS ok. ${real} of ${subchecks.length} checks proved something. What each did and did not:\n`,
  );
  for (const check of subchecks) {
    console.warn(`  [${check.real ? 'real   ' : 'vacuous'}] ${check.name}: ${check.verdict}`);
  }
  if (real < subchecks.length) {
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
