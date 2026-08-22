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
  TENANT_COLUMN,
  TENANT_KEY,
  TENANT_TABLE,
  VIEW_OPTION,
  canonicalPolicySql,
  AUTH_ROLE,
  AUTH_READER_TABLES,
  AUTH_FUNCTIONS,
} from '../src/db/access';
import type { TableAccess } from '../src/db/access';
import * as schema from '../src/db/schema';

/**
 * Gate G7, the assertion half. Ten checks, reported one line each and tagged real or vacuous.
 *
 * They become real at different moments, and a single verdict would let the vacuous ones pass for
 * proven (ADR 0048). Three are real with no migrations: the database roles, every declared Drizzle
 * table being classified, and the behavioural isolation probe. The other seven need a schema and say
 * so in their own line.
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

/**
 * `real` proved something. `waiting` has nothing to iterate yet and becomes real with the first
 * migration. `conditional` may never fire at all, and saying otherwise is the same overstatement
 * ADR 0048 is about, one level up: `table ownership` needs `convert_app` to own a row-scoped table,
 * which `bootstrap.sql` forbids outright, and `definer routines` needs somebody to write one.
 */
type SubcheckStatus = 'real' | 'waiting' | 'conditional';

type Subcheck = {
  name: string;
  failures: string[];
  /** What was actually proven, or - for a check with nothing to iterate - why it proved nothing. */
  verdict: string;
  status: SubcheckStatus;
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
    status: declaredTables.length > 0 ? 'real' : 'waiting',
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
    // Everything below asks about APP_ROLE by name - has_table_privilege, the policy role set - so a
    // DATABASE_URL_APP pointed at some other role would check a role that is not the one connecting.
    if (role.current_user !== APP_ROLE) {
      roleFailures.push(
        `DATABASE_URL_APP connects as ${role.current_user}, not ${APP_ROLE}. Every privilege and ` +
          'policy check below names the expected role, so they would describe a role that is not ' +
          'the one the application uses',
      );
    }
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

  // Membership is a capability, and the question is what the application can *effectively* do, not
  // what the graph looks like. The first version asked "is it a member of the owner" and review
  // escaped it with `create role rls_escape bypassrls; grant rls_escape to convert_app`. The second
  // walked the graph recursively with a depth bound of 16, and review escaped that by building a
  // seventeen-edge chain: the gate printed "can reach no role that bypasses" and the application
  // then ran `set role convert_auth` successfully.
  //
  // So the bound is gone and Postgres answers instead. `pg_has_role(..., 'SET')` is true exactly
  // when the role can `SET ROLE` to the target, at any depth and through any mix of INHERIT and SET
  // options, and `USAGE` is true exactly when it inherits the target's privileges. Both matter and
  // they are not the same: a chain granted `WITH INHERIT FALSE, SET FALSE` confers neither, and the
  // previous message called it an escape anyway, which was a false positive with a confident
  // explanation attached.
  if (role) {
    const reachable = await db.execute<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      can_set: boolean;
      inherits: boolean;
    }>(sql`
      select r.rolname,
             r.rolsuper,
             r.rolbypassrls,
             pg_has_role(${role.current_user}, r.oid, 'SET') as can_set,
             pg_has_role(${role.current_user}, r.oid, 'USAGE') as inherits
      from pg_roles r
      where r.rolname <> ${role.current_user}
        and (r.rolsuper or r.rolbypassrls or r.rolname = ${AUTH_ROLE})
    `);
    // The verdict comes from pg_has_role above. This is only for the remediation line: an operator
    // told "you can reach X" and not which grant to revoke has to go looking, and review pointed out
    // that dropping the old walk took that with it. Cycle-safe through a visited array and
    // deliberately unbounded, because a depth limit here is what hid a seventeen-edge chain when the
    // walk was load-bearing.
    const paths = new Map<string, string>();
    if (reachable.rows.some((r) => r.can_set || r.inherits)) {
      const walked = await db.execute<{ rolname: string; path: string }>(sql`
        with recursive climb(oid, path, visited) as (
          select r.oid, r.rolname::text, array[r.oid]
          from pg_roles r
          where r.rolname = ${role.current_user}
          union all
          select parent.oid,
                 climb.path || ' -> ' || parent.rolname,
                 climb.visited || parent.oid
          from climb
          join pg_auth_members m on m.member = climb.oid
          join pg_roles parent on parent.oid = m.roleid
          where not parent.oid = any(climb.visited)
        )
        select r.rolname, min(climb.path) as path
        from climb
        join pg_roles r on r.oid = climb.oid
        group by r.rolname
      `);
      for (const row of walked.rows) paths.set(row.rolname, row.path);
    }

    for (const row of reachable.rows) {
      // Role attributes are never inherited, so for a bypassing role only SET ROLE matters. For
      // the identity role both do: SET ROLE takes on its policies, and inheritance hands over the
      // privileges those policies gate.
      const isAuth = row.rolname === AUTH_ROLE;
      const dangerous = isAuth ? row.can_set || row.inherits : row.can_set;
      if (!dangerous) continue;

      const how = row.can_set
        ? row.inherits
          ? 'can SET ROLE to it and inherits its privileges'
          : 'can SET ROLE to it'
        : 'inherits its privileges';
      const why = isAuth
        ? 'owns the identity lookup functions and holds the permissive policy on the tables they ' +
          'read, so reaching it exposes every account it can see'
        : row.rolsuper
          ? 'is a SUPERUSER'
          : 'holds BYPASSRLS';
      const via = paths.get(row.rolname);
      roleFailures.push(
        `${role.current_user} can reach ${row.rolname}, and ${how}. That role ${why}` +
          (via ? `. Revoke along: ${via}` : '') +
          '. Postgres was asked directly with pg_has_role rather than walked to a fixed depth, so ' +
          'no length of membership chain hides this',
      );
    }
  }

  // A default privilege granting table rights to the application role defeats the registry for
  // every table a later migration creates. Deleting the ALTER DEFAULT PRIVILEGES statement from
  // bootstrap.sql does not undo one already installed in an existing database - that needs an
  // explicit REVOKE - so the catalogue state is asserted rather than assumed.
  const defaults = await db.execute<{
    schema: string;
    grantee: string;
    privilege: string;
    grantor: string;
  }>(sql`
    select coalesce(n.nspname, 'every schema') as schema,
           coalesce(pg_get_userbyid(a.grantee), 'PUBLIC') as grantee,
           a.privilege_type as privilege,
           -- defaclrole is load-bearing in the remediation: ALTER DEFAULT PRIVILEGES without a
           -- FOR ROLE clause targets the current role, so the command this check used to print was
           -- a no-op against an entry another role created, and an operator following it watched
           -- the gate stay red and concluded the tool was wrong.
           pg_get_userbyid(d.defaclrole) as grantor
    from pg_default_acl d
    -- LEFT join, and that is the whole finding. A default privilege created without IN SCHEMA has
    -- defaclnamespace = 0, which matches no pg_namespace row, so an inner join silently dropped
    -- every global entry: the gate printed "no default privilege grants rights on future tables"
    -- while one granted SELECT on every future table in every schema.
    left join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) as a
    where d.defaclobjtype = 'r'
      -- The grantor's own entry on its own future objects is not a grant to anybody else.
      and a.grantee <> d.defaclrole
  `);
  for (const row of defaults.rows) {
    // Any grantee, not only the application role and PUBLIC. Review granted a default privilege to
    // a third role and watched this check print "no default privilege grants rights on future
    // tables" - true of the two names it looked at, and false of the database. The next table
    // created would have carried an undeclared grant, which is the failure mode the registry
    // exists to prevent, arriving one migration later than the mistake.
    // Every grantee, with no exemption. Two earlier versions were narrower and review walked
    // through both: the first looked only at the application role and PUBLIC, so a default grant to
    // a third role passed; the second exempted convert_auth, and a blanket future-table grant to
    // the identity role is nothing like the SELECT on AUTH_READER_TABLES the registry declares. A
    // default privilege is the one grant that reaches tables nobody has written yet, so the
    // registry cannot describe it and it must not exist.
    const scope = row.schema === 'every schema' ? 'in every schema' : `in schema ${row.schema}`;
    const remedy = row.schema === 'every schema' ? '' : ` in schema ${row.schema}`;
    roleFailures.push(
      `default privileges ${scope} grant ${row.privilege} on future tables to ${row.grantee}, so ` +
        'every table a migration creates holds it whatever TABLE_ACCESS declares. Revoke it: ' +
        `alter default privileges for role ${row.grantor}${remedy} revoke ${row.privilege} on ` +
        `tables from ${row.grantee}`,
    );
  }

  subchecks.push({
    name: 'database roles',
    failures: roleFailures,
    status: 'real',
    verdict:
      `${role?.current_user} is ${APP_ROLE}, is neither superuser nor BYPASSRLS, and can reach ` +
      `no role that bypasses; ${ownerRole?.current_user} can bypass RLS as ADR 0052 requires; no ` +
      'default privilege grants rights on future tables',
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
    // Exit 3, not 1. CI has a step that points DATABASE_URL at a deliberately restricted role and
    // requires the gate to reject it - and asserting merely "non-zero" made that step pass on any
    // crash, including a bad password or a TypeScript error, and even with this whole check
    // deleted, because the isolation probe cannot insert its own fixture rows under such a role
    // either. A dedicated code makes the step assert the cause rather than the symptom.
    process.exit(3);
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
      and c.relname not in ('rls_probe', 'rls_expr_probe_workspace_rls', 'rls_expr_probe_user_rls')
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
    select coalesce(srcroot.relname, src.relname) as child,
           coalesce(tgtroot.relname, tgt.relname) as parent,
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
    -- Both ends are normalised to their partition roots. A foreign key may reference a partition
    -- directly, and a partition carries no registry entry of its own, so comparing raw names let a
    -- role-grants table reference a partition of the tenant table and escape both rules below.
    left join pg_class srcroot on srcroot.oid = pg_partition_root(src.oid)
    left join pg_class tgtroot on tgtroot.oid = pg_partition_root(tgt.oid)
    where con.contype = 'f' and n.nspname = 'public'
  `);

  // ---- 3. ownership, and who can reach the owner. ---------------------------------------------
  //
  // The first version asked only whether the application role owned a policed table, which
  // `bootstrap.sql` forbids, so it never had anything to iterate. Review found the gap that made
  // that narrowness dangerous: **ownership is a capability the application can acquire.** FORCE ROW
  // LEVEL SECURITY stops an owner bypassing its policies; it does not stop the owner running
  // `alter table ... disable row level security`. So a plain role that owns a policed table and is
  // `SET`-reachable from convert_app is a full escape, and both the role subcheck and this one
  // looked straight past it: the role walk only considers roles that bypass or own the identity
  // functions, and this one only considered tables literally owned by the application.
  //
  // Review demonstrated it end to end: transfer `user` to an ordinary nosuperuser nobypassrls role,
  // grant that role to convert_app `with inherit false, set true`, and the gate stayed green while
  // the application set the role, disabled RLS, and read every account.
  const ownershipFailures: string[] = [];
  const policed = tables.filter((t) => {
    const access = entryFor(t);
    return access !== undefined && isRlsAccess(access);
  });

  const owners = [...new Set(policed.map((t) => t.owner))];
  const ownerReach = new Map<string, { can_set: boolean; inherits: boolean }>();
  if (role && owners.length > 0) {
    const reach = await db.execute<{ rolname: string; can_set: boolean; inherits: boolean }>(sql`
      select r.rolname,
             pg_has_role(${role.current_user}, r.oid, 'SET') as can_set,
             pg_has_role(${role.current_user}, r.oid, 'USAGE') as inherits
      from pg_roles r
      where r.rolname = any(${sql.raw(
        `array[${owners.map((o) => `'${o.replace(/'/g, "''")}'`).join(', ')}]::name[]`,
      )})
    `);
    for (const row of reach.rows) {
      ownerReach.set(row.rolname, { can_set: row.can_set, inherits: row.inherits });
    }
  }

  for (const t of policed) {
    if (t.owner === role?.current_user) {
      if (!t.forced) {
        ownershipFailures.push(
          `${t.relname}: is owned by the application role and is not FORCE ROW LEVEL SECURITY, so ` +
            'the owner bypasses its policies',
        );
      }
      ownershipFailures.push(
        `${t.relname}: is owned by the application role, which can therefore disable row-level ` +
          'security on it whatever FORCE says',
      );
      continue;
    }
    const reach = ownerReach.get(t.owner);
    if (reach && (reach.can_set || reach.inherits)) {
      const how = reach.can_set ? 'can SET ROLE to' : 'inherits';
      ownershipFailures.push(
        `${t.relname}: is owned by ${t.owner}, and ${APP_ROLE} ${how} that role. An owner can run ` +
          'ALTER TABLE DISABLE ROW LEVEL SECURITY, which FORCE does not prevent, so reaching the ' +
          'owner is equivalent to holding BYPASSRLS on this table',
      );
    }
  }

  subchecks.push({
    name: 'table ownership',
    failures: ownershipFailures,
    // Real once any policed table exists, because there is now an owner to ask about. It was
    // `conditional` while the only question was whether convert_app owned one, which bootstrap.sql
    // forbids outright.
    status: policed.length > 0 ? 'real' : 'waiting',
    verdict:
      policed.length > 0
        ? `${policed.length} policed table(s) are owned by a role ${APP_ROLE} can neither become nor inherit`
        : 'no table needs a policy yet, so there was no owner to ask about',
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

  // Both directions. The first version checked only that a view is classified `view`, and left the
  // converse unchecked - so a real table classified `view` skipped the graph checks, the policy
  // checks and the reason requirement all at once. Review turned the previously-leaking `lead_note`
  // shape back on by changing one word in its entry.
  for (const table of tables) {
    // Only real tables. `tables` also holds views now that they are classifiable, and iterating all
    // of it reported every correctly-classified view as a table - caught by the positive control.
    if (table.relkind !== 'r' && table.relkind !== 'p') continue;
    const access = entryFor(table);
    if (access && access.kind === 'view') {
      catalogueFailures.push(
        `${table.relname}: is a ${table.relkind === 'p' ? 'partitioned table' : 'table'} classified ` +
          'view. The view class describes a view or a materialized view only, and it is the class ' +
          'with no reason field and no policy requirement, so it is the last one a table may use',
      );
    }
  }

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
    // Transitive, through any chain of views. The first version joined pg_rewrite once, so a
    // materialized view over a *view* over a tenant table passed - review found it, and the
    // intermediate view being correctly marked security_invoker made no difference, because the
    // matview stores rows the owner computed. The path is reported so the chain is readable.
    const reads = await db.execute<{
      viewname: string;
      base: string;
      root: string;
      path: string;
    }>(sql`
      with recursive closure(top, rel, path, depth) as (
        select c.oid, c.oid, c.relname::text, 0
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'm'
        union all
        select closure.top, base.oid, closure.path || ' -> ' || base.relname, closure.depth + 1
        from closure
        join pg_rewrite r on r.ev_class = closure.rel
        join pg_depend d
          on d.objid = r.oid
         and d.classid = 'pg_rewrite'::regclass
         and d.refclassid = 'pg_class'::regclass
        join pg_class base on base.oid = d.refobjid
        where base.oid <> closure.rel and closure.depth < 32
      )
      select distinct
             top_rel.relname as viewname,
             base.relname as base,
             coalesce(rt.relname, base.relname) as root,
             closure.path
      from closure
      join pg_class top_rel on top_rel.oid = closure.top
      join pg_class base on base.oid = closure.rel
      left join pg_class rt on rt.oid = pg_partition_root(base.oid)
      where closure.depth > 0 and base.relkind in ('r', 'p')
    `);
    // A dependency on a routine hides the base table entirely: `create materialized view mv as
    // select * from all_workspaces()` where the function `returns table (...)` produces no
    // pg_class edge at all, so the closure above sees nothing. REFRESH runs as the owner, which
    // ADR 0052 requires to bypass, so the stored rows are every tenant's. Refused unconditionally
    // rather than analysed - dependencies on built-in functions are not recorded in pg_depend, so
    // this only fires on routines somebody wrote.
    const throughRoutine = await db.execute<{ viewname: string; routine: string }>(sql`
      select distinct dependent.relname as viewname, pr.proname as routine
      from pg_depend d
      join pg_rewrite r on r.oid = d.objid
      join pg_class dependent on dependent.oid = r.ev_class
      join pg_proc pr on pr.oid = d.refobjid
      join pg_namespace n on n.oid = dependent.relnamespace
      where d.classid = 'pg_rewrite'::regclass
        and d.refclassid = 'pg_proc'::regclass
        and dependent.relkind = 'm'
        and n.nspname = 'public'
    `);
    for (const row of throughRoutine.rows) {
      catalogueFailures.push(
        `${row.viewname}: is a materialized view whose definition calls ${row.routine}(). What a ` +
          'routine reads cannot be followed through the dependency graph - a function returning ' +
          'TABLE leaves no dependency on the tables it selects from - and REFRESH runs as the ' +
          'owner, which bypasses row-level security. A materialized view here may only select ' +
          'directly from relations (ADR 0051)',
      );
    }

    for (const row of reads.rows) {
      const baseAccess = REGISTRY[row.root];
      if (baseAccess && isRlsAccess(baseAccess)) {
        catalogueFailures.push(
          `${row.viewname}: is a materialized view reading ${row.base}, which is ` +
            `${baseAccess.kind} (${row.path}). Row-level security is never applied when reading a ` +
            'materialized view, and no option changes that, so its contents are readable in full ' +
            'by anyone holding SELECT on it - an intermediate view being security_invoker does not ' +
            'help, because the rows were computed by the owner at refresh time. A real table ' +
            'maintained by the worker, with its own policy, is the replacement (ADR 0051)',
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
    status: relations.rows.length > 0 ? 'real' : 'waiting',
    verdict:
      relations.rows.length > 0
        ? `${relations.rows.length} relation(s) in public classified ` +
          `(${tables.filter((t) => t.relkind === 'r' || t.relkind === 'p').length} table(s), ` +
          `${views.filter((v) => v.relkind === 'v').length} view(s), ` +
          `${views.filter((v) => v.relkind === 'm').length} materialized)`
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
    // fk.parent is already the partition root, so a reference to workspace_2026(id) arrives here as
    // a reference to workspace(id) and is held to the same rule.
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
        // Any row-scoped parent, not just the tenancy axis. Stopping only at `workspace-rls` walked
        // straight through `user-rls` - so a table hanging off `session` was reachable from every
        // user's rows while carrying a reason about being "reached only through a scoped session".
        // Same bug as the one this walk was written to fix, on ADR 0047's axis instead of ADR 0002's.
        if (parent === TENANT_TABLE || (access && isRlsAccess(access))) {
          return [...path, parent];
        }
        queue.push({ table: parent, path: [...path, parent] });
      }
    }
    return null;
  };

  for (const [name, access] of ENTRIES) {
    // Every class that carries no policy of its own, which is `role-grants` and `view`. Gating this
    // on `role-grants` alone is what made `kind: 'view'` an escape hatch.
    if (isRlsAccess(access)) continue;
    if (!inDatabase.has(name)) continue;
    const path = pathToTenantData(name);
    if (path) {
      graphFailures.push(
        `${name}: is classified ${access.kind} and reaches row-scoped data by foreign key ` +
          `(${path.join(' -> ')}). Grants control operations, never row visibility, so every row ` +
          'of it is readable by the application whatever its reason says. It needs a policy of ' +
          'its own, or a tenant column to scope by',
      );
    }
  }

  // (b2) the conventional tenant column, checked as well as the graph rather than instead of it.
  // The graph is blind when there is no foreign key, and an append-only event log deliberately has
  // none so its rows outlive what they describe. That shape passed as role-grants and read every
  // tenant's rows. This check existed, was deleted as redundant when the graph landed, and is back.
  for (const col of columns.rows) {
    if (col.column !== TENANT_COLUMN) continue;
    const table = inDatabase.get(col.relname);
    const access = table ? entryFor(table) : REGISTRY[col.relname];
    if (!access) continue;

    // The name alone is the trigger. The first version of this check also required the column to be
    // a NOT NULL uuid before it would look, which made the type and nullability *preconditions for
    // noticing* rather than extra findings - so `workspace_id uuid` without NOT NULL silenced it
    // entirely. That is the idiomatic spelling for the very table this check was restored for: one
    // with no foreign key has nothing to make the column NOT NULL against. Review demonstrated the
    // leak. The same `continue` also swallowed `workspace_id text` and a domain over uuid.
    const notes: string[] = [];
    if (col.type !== 'uuid') notes.push(`its type is ${col.type} rather than uuid`);
    if (!col.notNull) {
      notes.push(
        'it is nullable, so a row with a null tenant id is unreachable rather than scoped',
      );
    }
    const suffix = notes.length > 0 ? ` Also: ${notes.join('; ')}.` : '';

    if (access.kind !== 'workspace-rls') {
      graphFailures.push(
        `${col.relname}: carries a ${TENANT_COLUMN} column and is classified ${access.kind}. A ` +
          'column with that name holds a tenant id, so the table is tenant data and needs the ' +
          'tenancy policy - a missing foreign key is not evidence of anything, and neither is a ' +
          `missing NOT NULL.${suffix}`,
      );
    } else if (access.scopeColumn !== TENANT_COLUMN) {
      graphFailures.push(
        `${col.relname}: carries ${TENANT_COLUMN} but scopes by ${access.scopeColumn}, so the ` +
          `policy compares something other than the column holding the tenant id.${suffix}`,
      );
    } else if (notes.length > 0) {
      graphFailures.push(
        `${col.relname}: is workspace-rls on ${TENANT_COLUMN}, but ${notes.join('; ')}`,
      );
    }
  }

  // (b3) non-partition inheritance. `INHERITS` copies NOT NULL and CHECK constraints and never
  // foreign keys, and a child is relkind 'r' with relispartition false and no partition root - so
  // both the partition handling and the graph are blind to it. Querying the parent does apply the
  // parent's policy to child rows, which is what makes the reason plausible; querying the child
  // directly does not, which is what makes it a leak.
  const inherited = await db.execute<{ child: string; parent: string }>(sql`
    select child.relname as child, parent.relname as parent
    from pg_inherits i
    join pg_class child on child.oid = i.inhrelid
    join pg_class parent on parent.oid = i.inhparent
    join pg_namespace n on n.oid = child.relnamespace
    where n.nspname = 'public' and child.relispartition = false
  `);
  for (const row of inherited.rows) {
    graphFailures.push(
      `${row.child}: inherits ${row.parent} without being a partition of it. Inheritance copies ` +
        'NOT NULL and CHECK constraints but never foreign keys, so nothing ties the child to the ' +
        'tenancy graph, and reading the child directly does not apply the parent policy that ' +
        'reading the parent does. Use declarative partitioning, or give the child its own entry ' +
        'and its own policy',
    );
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
    status: inDatabase.size > 0 ? 'real' : 'waiting',
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

      // Per role, not per table (ADR 0054). Permissive policies combine with OR, so a second one
      // can only widen what is visible - but only among the policies that *apply to the current
      // role*. A policy declared TO convert_auth never enters the OR when convert_app is asking, so
      // counting per table would refuse the identity read path while proving nothing extra. What
      // still has to hold is one permissive policy per table and role.
      //
      // A policy granted to PUBLIC is counted against every role deliberately: PUBLIC applies to
      // whoever asks, including roles that do not exist yet.
      const appliesTo = (p: (typeof permissive)[number], role: string) =>
        p.roles.includes(role) || p.roles.includes('PUBLIC');

      const forApp = permissive.filter((p) => appliesTo(p, APP_ROLE));
      const forAuth = permissive.filter((p) => appliesTo(p, AUTH_ROLE));
      const orphans = permissive.filter(
        (p) => !appliesTo(p, APP_ROLE) && !appliesTo(p, AUTH_ROLE),
      );

      for (const p of orphans) {
        failures.push(
          `${label}: permissive policy ${p.polname} applies to [${[...p.roles].sort().join(', ')}], ` +
            `which is neither ${APP_ROLE} nor ${AUTH_ROLE}. Do not read that as harmless: a policy ` +
            `granted to a group role reaches every member of it, so if ${APP_ROLE} is a member ` +
            'this widens what the application sees. Either it is dead or it is an undeclared ' +
            'boundary, and either way it has to be a decision rather than a leftover',
        );
      }

      if (forApp.length === 0) {
        failures.push(
          `${label}: row-level security is enabled but no permissive policy applies to ${APP_ROLE}`,
        );
        continue;
      }
      if (forApp.length > 1) {
        failures.push(
          `${label}: has ${forApp.length} permissive policies applying to ${APP_ROLE} (${forApp
            .map((p) => p.polname)
            .join(', ')}). They combine with OR, so a second one can only widen what the ` +
            'application sees. Restrictive policies are fine; a second permissive one is not',
        );
        continue;
      }

      // The auth_reader half (ADR 0054). Expected exactly on the tables the identity functions
      // read, and refused everywhere else: a permissive policy for convert_auth on a table no
      // function reads is a role seeing rows for no stated reason.
      const wantsAuthReader = AUTH_READER_TABLES.has(name);
      if (wantsAuthReader && forAuth.length !== 1) {
        failures.push(
          `${label}: ${forAuth.length} permissive policies apply to ${AUTH_ROLE}, expected exactly ` +
            `one. The identity lookup functions run as that role and are subject to this table's ` +
            'policies like anything else, so without it sign-in cannot find the account it was ' +
            'asked for (ADR 0054)',
        );
      }
      if (!wantsAuthReader && forAuth.length > 0) {
        failures.push(
          `${label}: ${forAuth.length} permissive policies apply to ${AUTH_ROLE} (${forAuth
            .map((p) => p.polname)
            .join(', ')}), but no function in AUTH_FUNCTIONS reads this table. Either the function ` +
            'is missing from the registry or the policy should not exist',
        );
      }
      if (wantsAuthReader && forAuth.length === 1) {
        const reader = forAuth[0]!;
        const readerRoles = [...reader.roles].sort();
        if (readerRoles.length !== 1 || readerRoles[0] !== AUTH_ROLE) {
          failures.push(
            `${label}: policy ${reader.polname} applies to [${readerRoles.join(', ')}] rather than ` +
              `exactly ${AUTH_ROLE}`,
          );
        }
        if (reader.cmd !== 'r') {
          failures.push(
            `${label}: policy ${reader.polname} is not FOR SELECT. The lookup role reads; it has no ` +
              'reason to write, and a wider command on a using(true) policy is a write nobody scoped',
          );
        }
        if (reader.qual !== 'true') {
          failures.push(
            `${label}: policy ${reader.polname} is not the canonical auth_reader expression.
` +
              `      expected: true
` +
              `      actual:   ${reader.qual}`,
          );
        }
      }

      const policy = forApp[0]!;
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
      status: present.length > 0 ? 'real' : 'waiting',
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
        and c.relname not in ('rls_probe', 'rls_expr_probe_workspace_rls', 'rls_expr_probe_user_rls')
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

    // Who else holds anything, which the check above cannot see.
    //
    // Everything before this asks `has_table_privilege(convert_app, ...)` and whether PUBLIC holds
    // something. Both are blind to a third role: `grant select on contact to some_role` passed every
    // subcheck. That is not hypothetical - the identity read path needs exactly such a grant, and
    // adding it left the gate reporting "3 tables hold exactly their declared privileges" while one
    // of them had an undeclared grantee.
    //
    // So the grantee set is asserted whole: the owner, the application role with the privileges the
    // registry declares, and `convert_auth` with SELECT on the tables AUTH_FUNCTIONS reads. Anything
    // else is a boundary nobody wrote down.
    const acl = await db.execute<{
      relname: string;
      grantee: string;
      privilege: string;
      grantable: boolean;
      column_name: string | null;
    }>(sql`
      select c.relname,
             case when acl.grantee = 0 then 'PUBLIC' else coalesce(r.rolname, '?') end as grantee,
             acl.privilege_type as privilege,
             acl.is_grantable as grantable,
             null::text as column_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
      left join pg_roles r on r.oid = acl.grantee
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm')
        and acl.grantee <> c.relowner
        and c.relname not in ('rls_probe', 'rls_expr_probe_workspace_rls', 'rls_expr_probe_user_rls')
      union all
      -- Column grants, for every grantee. The check further up catches a column grant held by the
      -- application role; a column ACL belonging to any other role was invisible, and
      -- information_schema.role_table_grants does not show them either. Review granted SELECT on a
      -- single column of "user" to a third role and the whole gate stayed green.
      select c.relname,
             case when acl.grantee = 0 then 'PUBLIC' else coalesce(r.rolname, '?') end as grantee,
             acl.privilege_type as privilege,
             acl.is_grantable as grantable,
             a.attname as column_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      cross join lateral aclexplode(a.attacl) as acl
      left join pg_roles r on r.oid = acl.grantee
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm')
        and acl.grantee <> c.relowner
        and c.relname not in ('rls_probe', 'rls_expr_probe_workspace_rls', 'rls_expr_probe_user_rls')
    `);

    for (const table of tables) {
      const access = entryFor(table);
      if (!access) continue;
      const name = table.relname;
      const label = table.isPartition ? `${name} (partition of ${table.root})` : name;

      const allowed = new Map<string, readonly string[]>([
        [APP_ROLE, [...access.appPrivileges]],
      ]);
      if (AUTH_READER_TABLES.has(name)) allowed.set(AUTH_ROLE, ['SELECT']);

      for (const row of acl.rows.filter((r) => r.relname === name)) {
        const where = row.column_name === null ? '' : ` on column ${row.column_name}`;
        if (row.column_name !== null) {
          grantFailures.push(
            `${label}: ${row.grantee} holds ${row.privilege}${where}. TABLE_ACCESS models table ` +
              'privileges and nothing else, so a column grant is access the registry cannot ' +
              'describe. Grant at table level or not at all',
          );
          continue;
        }
        if (row.grantable) {
          grantFailures.push(
            `${label}: ${row.grantee} holds ${row.privilege} WITH GRANT OPTION, so it can hand the ` +
              'privilege to anyone and the registry stops describing who can read this table',
          );
        }
        const permitted = allowed.get(row.grantee);
        if (!permitted) {
          grantFailures.push(
            `${label}: ${row.grantee} holds ${row.privilege}, and the registry names no such ` +
              'grantee. A grant to a role TABLE_ACCESS does not mention is access nobody declared',
          );
          continue;
        }
        if (!permitted.includes(row.privilege)) {
          grantFailures.push(
            `${label}: ${row.grantee} holds ${row.privilege}, beyond the ` +
              `[${permitted.join(', ')}] the registry allows it`,
          );
        }
      }
    }
  }

  subchecks.push({
    name: 'effective privileges',
    failures: grantFailures,
    status: inDatabase.size > 0 ? 'real' : 'waiting',
    verdict:
      inDatabase.size > 0
        ? `${inDatabase.size} table(s) hold exactly their declared privileges, with no column ` +
          'grant, no PUBLIC grant and none of TRUNCATE, REFERENCES or TRIGGER'
        : `there are no public tables yet (${ENTRIES.length} classified), so no privilege was compared`,
  });

  // ---- 9. SECURITY DEFINER routines, which ADR 0052 turned into bypasses. ---------------------
  //
  // A function is not a relation, so nothing here had an opinion about one. That was defensible
  // while the owner was subject to policy: FORCE ROW LEVEL SECURITY removed the owner's exemption,
  // so a definer function owned by the owner was still policed. ADR 0052 deliberately removed that,
  // which converts every such function into a full bypass - measured, same function and caller, only
  // the owner's attributes changed: 0 rows policed, 2 rows (every tenant) once the owner could
  // bypass. And `proacl` defaults to EXECUTE for PUBLIC, so no GRANT appears anywhere for a reviewer
  // to notice and the application needs no privilege it does not already hold.
  //
  // This is the cost ADR 0052 undercounted, so it is checked rather than described.

  const definerFailures: string[] = [];
  const definers = await db.execute<{
    routine: string;
    owner: string;
    canBypass: boolean;
    appCanExecute: boolean;
    searchPath: string | null;
  }>(sql`
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as routine,
           o.rolname as owner,
           (o.rolsuper or o.rolbypassrls) as "canBypass",
           has_function_privilege(${APP_ROLE}, p.oid, 'EXECUTE') as "appCanExecute",
           -- starts_with, not LIKE: an underscore is a LIKE wildcard and the backslash escape
           -- collapses inside a template literal, which is how the fixture exclusion went wrong.
           (
             select cfg
             from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
             where starts_with(cfg, 'search_path=')
             limit 1
           ) as "searchPath"
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles o on o.oid = p.proowner
    where n.nspname = 'public' and p.prosecdef
  `);

  for (const routine of definers.rows) {
    // No `appCanExecute` condition. Asking whether the application can execute *this* routine is
    // the narrow version of the question, and review beat it with two hops: an inner definer owned
    // by the bypassing owner with EXECUTE revoked, called by an outer definer owned by an ordinary
    // role with EXECUTE defaulting to PUBLIC. Each routine satisfied one clause; the pair leaked.
    // The migration owner is by design the only bypassing role, so a definer routine it owns has no
    // legitimate use here and the reachability question does not need answering.
    if (routine.canBypass) {
      definerFailures.push(
        `${routine.routine}: is SECURITY DEFINER and owned by ${routine.owner}, which can bypass ` +
          'row-level security, so every row it reads is unscoped no matter who calls it or through ' +
          `how many hops (${APP_ROLE} ` +
          `${routine.appCanExecute ? 'can execute it directly' : 'cannot execute it directly, which does not help - another routine can'}). ` +
          'Own it with a non-bypassing role, or do not use SECURITY DEFINER (ADR 0052)',
      );
    }

    // Presence is not enough. `SET search_path = public` is what people actually write, and it
    // leaves pg_temp ahead of public in the effective path, so the application can shadow a table
    // the routine names unqualified - review created a temp table called `workspace` and the
    // routine read it. An empty search_path, or one ending in pg_temp, is safe.
    const value = routine.searchPath?.slice('search_path='.length).trim() ?? null;
    if (value === null) {
      definerFailures.push(
        `${routine.routine}: is SECURITY DEFINER without SET search_path, so an unqualified name ` +
          `inside it resolves through the caller's search_path, and ${APP_ROLE} can create ` +
          'objects in a temp schema that precedes public',
      );
    } else {
      const parts = value
        .split(',')
        .map((part) => part.trim().replace(/^"(.*)"$/, '$1'))
        .filter((part) => part.length > 0);
      const safe = parts.length === 0 || parts[parts.length - 1] === 'pg_temp';
      if (!safe) {
        definerFailures.push(
          `${routine.routine}: is SECURITY DEFINER with search_path = ${value}, which leaves ` +
            'pg_temp ahead of it in the effective search path, so an unqualified name inside the ' +
            `routine can resolve to a temp table ${APP_ROLE} created. Use an empty search_path, ` +
            'or put pg_temp last',
        );
      }
    }
  }

  subchecks.push({
    name: 'definer routines',
    failures: definerFailures,
    // Conditional: nothing in a migration forces a SECURITY DEFINER routine to exist.
    status: definers.rows.length > 0 ? 'real' : 'conditional',
    verdict:
      definers.rows.length > 0
        ? `${definers.rows.length} SECURITY DEFINER routine(s) are owned by a non-bypassing role or unreachable from ${APP_ROLE}`
        : 'there are no SECURITY DEFINER routines in public, so there was nothing to check',
  });

  // ---- 9b. the identity functions match their registry, in both directions. -------------------
  //
  // AUTH_FUNCTIONS described itself as a registry the gate compares against and nothing imported
  // it, so review passed three mutations through a green gate. The first version of this subcheck
  // fixed that and matched on the bare function *name*, which review then walked through twice: a
  // registered name with a different argument signature passed, and an extra overload owned by
  // convert_auth passed while the verdict counted three matches against a two-entry registry. An
  // overload is a fully executable read path holding the identity role's visibility.
  //
  // So the key is (schema, name, argument types), exactly one match is required per entry, and
  // anything convert_auth owns in *any* schema and of any routine kind has to be registered. The
  // earlier version filtered to `public`, and a lookalike one schema over was invisible.
  const identityFailures: string[] = [];

  const authRole = await db.execute<{
    rolcanlogin: boolean;
    rolsuper: boolean;
    rolbypassrls: boolean;
  }>(sql`
    select rolcanlogin, rolsuper, rolbypassrls from pg_roles where rolname = ${AUTH_ROLE}
  `);
  const registered = Object.entries(AUTH_FUNCTIONS);
  const authRoleRow = authRole.rows[0];

  if (!authRoleRow && registered.length > 0) {
    identityFailures.push(
      `${AUTH_ROLE} does not exist, but AUTH_FUNCTIONS registers ${registered.length} function(s) ` +
        'that must be owned by it',
    );
  }
  if (authRoleRow) {
    if (authRoleRow.rolcanlogin) {
      identityFailures.push(
        `${AUTH_ROLE} has LOGIN. Nothing connects as it - the application reaches identity data ` +
          'through EXECUTE - so a login is a credential that exists to be leaked (ADR 0054)',
      );
    }
    if (authRoleRow.rolsuper || authRoleRow.rolbypassrls) {
      identityFailures.push(
        `${AUTH_ROLE} is superuser or holds BYPASSRLS, which makes every routine it owns a hole ` +
          'and would put them in the class this gate refuses (ADR 0052)',
      );
    }
  }

  const registeredNames = registered.map(([name]) => name);
  const routines = await db.execute<{
    schema: string;
    name: string;
    args: string;
    kind: string;
    owner: string;
    definer: boolean;
    volatility: string;
    config: string[] | null;
    result: string;
    acl: string[];
  }>(sql`
    select n.nspname as schema,
           p.proname as name,
           coalesce(oidvectortypes(p.proargtypes), '') as args,
           p.prokind as kind,
           pg_get_userbyid(p.proowner) as owner,
           p.prosecdef as definer,
           p.provolatile as volatility,
           p.proconfig as config,
           coalesce(pg_get_function_result(p.oid), '') as result,
           coalesce((
             select array_agg(
               (case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end)
               || ':' || a.privilege_type
               || case when a.is_grantable then ':GRANTABLE' else '' end
             )
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
             where a.grantee <> p.proowner
           ), '{}')::text[] as acl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where pg_get_userbyid(p.proowner) = ${AUTH_ROLE}
       or (n.nspname = 'public' and p.proname = any(${sql.raw(
         registeredNames.length > 0
           ? `array[${registeredNames.map((n) => `'${n}'`).join(', ')}]::name[]`
           : `array[]::name[]`,
       )}))
  `);

  const signature = (r: { schema: string; name: string; args: string }) =>
    `${r.schema}.${r.name}(${r.args})`;
  const matched = new Set<string>();

  for (const [name, spec] of registered) {
    const wanted = `public.${name}(${spec.args.join(', ')})`;
    const candidates = routines.rows.filter((r) => signature(r) === wanted && r.kind === 'f');
    if (candidates.length === 0) {
      if (inDatabase.size > 0) {
        const sameName = routines.rows.filter((r) => r.name === name).map(signature);
        identityFailures.push(
          `no function ${wanted} exists. AUTH_FUNCTIONS registers it by schema, name and argument ` +
            'types, so a different signature is a different function' +
            (sameName.length > 0 ? `. Found instead: ${sameName.join(', ')}` : ''),
        );
      }
      continue;
    }
    if (candidates.length > 1) {
      identityFailures.push(
        `${wanted} resolves to ${candidates.length} routines, which is ambiguous. Exactly one ` +
          'function must match each registry key',
      );
    }
    const found = candidates[0]!;
    matched.add(signature(found));

    if (found.owner !== AUTH_ROLE) {
      identityFailures.push(
        `${wanted} is owned by ${found.owner} rather than ${AUTH_ROLE}. A definer routine owned by ` +
          'the migration owner bypasses row-level security, which is the shape ADR 0052 refuses',
      );
    }
    if (!found.definer) {
      identityFailures.push(
        `${wanted} is not SECURITY DEFINER, so it runs as the caller and cannot see the row it was ` +
          'asked for. It would also vanish from the definer subcheck, which only reads prosecdef',
      );
    }
    if (found.volatility !== 's') {
      identityFailures.push(
        `${wanted} is volatility '${found.volatility}' rather than STABLE. A read-only lookup is ` +
          'stable; anything else either forbids planner reuse or claims an immutability it lacks',
      );
    }
    // Compared exactly, not merely for presence. Review set `search_path = pg_catalog, pg_temp` and
    // the check passed while the registry documents an empty path, so the subcheck was claiming a
    // comparison it was not making.
    const path = (found.config ?? []).find((entry) => entry.startsWith('search_path='));
    if (path !== 'search_path=""') {
      identityFailures.push(
        `${wanted} has ${path ?? 'no search_path set'} where an empty search_path is required. ` +
          'Every name inside is schema-qualified on that assumption, and a non-empty path is a ' +
          'different resolution order than the one that was reviewed',
      );
    }

    const returned = found.result
      .replace(/^TABLE\(/i, '')
      .replace(/\)$/, '')
      .split(',')
      .map((column) => column.trim().split(/\s+/)[0])
      .filter((column): column is string => column !== undefined && column.length > 0);
    const declared = [...spec.returns].sort().join(', ');
    if (returned.sort().join(', ') !== declared) {
      identityFailures.push(
        `${wanted} returns [${returned.join(', ')}] where AUTH_FUNCTIONS declares [${declared}]. ` +
          'Widening or narrowing a lookup is a change to the registry first, because a function ' +
          'returning more than it declares rebuilds the leak inside itself where no gate can see it',
      );
    }

    // Set equality, both directions. The earlier version rejected unexpected entries and never
    // required the expected one, so revoking EXECUTE from the application left the gate green while
    // the integration suite failed with `permission denied for function`.
    const acl = [...found.acl].sort().join(', ');
    const wantedAcl = `${APP_ROLE}:EXECUTE`;
    if (acl !== wantedAcl) {
      identityFailures.push(
        `${wanted} grants [${acl || 'nothing'}] where exactly [${wantedAcl}] is required. EXECUTE ` +
          'defaults to PUBLIC on a new function, so the migration revokes it and grants the ' +
          'application alone, with no grant option',
      );
    }
  }

  for (const routine of routines.rows) {
    // Two rules, not one. Anything convert_auth owns anywhere must be registered, and any routine
    // in `public` wearing a registered *name* must be registered too, whoever owns it. The previous
    // version applied only the first, so review created `auth_find_user_by_phone(integer)` owned by
    // the migration owner: the query loaded it, the check ignored it, and the verdict still claimed
    // an exact registry match while an unreviewed callable sat under an authentication name.
    const unregisteredName =
      routine.schema === 'public' && registeredNames.includes(routine.name);
    if ((routine.owner === AUTH_ROLE || unregisteredName) && !matched.has(signature(routine))) {
      identityFailures.push(
        `${signature(routine)} is owned by ${AUTH_ROLE} and is not a registered lookup. The role ` +
          'exists to own exactly the surface AUTH_FUNCTIONS names, so an overload, a procedure, or ' +
          'a function in another schema is a read path nobody declared',
      );
    }
  }

  subchecks.push({
    name: 'identity functions',
    failures: identityFailures,
    // Real once a migrated schema exists, because that is when the registry's functions are meant
    // to. Keying this off how many routines were *found* let a database with every function missing
    // report `waiting` while accumulating failures.
    status: inDatabase.size > 0 ? 'real' : 'waiting',
    verdict:
      inDatabase.size > 0
        ? `${matched.size} of ${registered.length} registered function(s) matched on schema, name, argument types, owner, definer, volatility, search_path, result columns and exact ACL`
        : 'no migrated schema yet, so the registry had nothing to compare against',
  });

  // ---- 10. does isolation actually hold? Behavioural, on a fixture table. --------------------
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

  // Same clash guard deriveCanonicalQual has. This probe used to open with `drop table if exists`
  // while the allowlist made the name invisible to the catalogue checks, so a real table called
  // rls_probe was silently deleted and never reported - review created one with a row in it and
  // watched it disappear.
  const probeClash = await db.execute<{ ok: boolean }>(sql`
    select true as ok
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'rls_probe'
  `);
  if (probeClash.rows.length > 0) {
    throw new Error(
      "rls_probe already exists in the public schema. That is this script's fixture name, so " +
        'either a previous run died before dropping it or a migration has claimed the name. ' +
        'Inspect it rather than letting the gate drop it.',
    );
  }

  try {
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
    status: 'real',
    verdict:
      'a cross-tenant read returned nothing, an empty context returned nothing, and the owner ' +
      'saw both rows',
  });

  // ---- report ------------------------------------------------------------------------------

  // Deduplicated: a partitioned table yields one foreign-key row per partition and the view closure
  // yields one row per path, so the same sentence can arrive several times. Repeating it buries the
  // other failures.
  for (const check of subchecks) check.failures = [...new Set(check.failures)];

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

  const counts = {
    real: subchecks.filter((c) => c.status === 'real').length,
    waiting: subchecks.filter((c) => c.status === 'waiting').length,
    conditional: subchecks.filter((c) => c.status === 'conditional').length,
  };
  console.warn(
    `RLS ok. ${counts.real} of ${subchecks.length} checks proved something; ${counts.waiting} ` +
      `wait for a schema; ${counts.conditional} may never fire. What each did and did not:\n`,
  );
  const pad = { real: 'real       ', waiting: 'waiting    ', conditional: 'conditional' };
  for (const check of subchecks) {
    console.warn(`  [${pad[check.status]}] ${check.name}: ${check.verdict}`);
  }
  if (counts.waiting > 0 || counts.conditional > 0) {
    console.warn(
      '\nNeither the waiting nor the conditional checks are passes. A waiting check becomes real ' +
        'with the first migration that gives it something to iterate. A conditional one may never ' +
        'fire at all, and calling it "not yet real" would overstate it (ADR 0048).',
    );
  }
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
