import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';

/**
 * Creates the application database role, before any migration runs.
 *
 * Connects as the owner (DATABASE_URL), because creating a role is DDL. The application
 * itself never connects with this script's credentials — that is the entire point. See
 * ADR 0042.
 *
 * Idempotent: safe to run on every deploy and on a database that already has the role.
 */
const main = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (the owner connection, used for DDL)');

  const password = process.env.APP_DB_PASSWORD;
  if (!password) {
    throw new Error(
      'APP_DB_PASSWORD is not set. This is the password for the application role that ' +
        'DATABASE_URL_APP connects with. It is a secret: Infisical in every environment ' +
        'except CI, where the ephemeral container makes a throwaway value correct.',
    );
  }

  const db = createDatabase(url);
  const statements = await readFile(join(__dirname, '../src/db/bootstrap.sql'), 'utf8');

  // The password is bound as a parameter rather than interpolated into the SQL. A DO block
  // cannot take parameters, so it reads the value back out with current_setting.
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('convert.app_password', ${password}, true)`);
    await tx.execute(sql.raw(statements));
  });

  const role = await db.execute<{
    rolname: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcreaterole: boolean;
  }>(sql`
    select rolname, rolsuper, rolbypassrls, rolcreaterole
    from pg_roles
    where rolname in ('convert_app', 'convert_auth')
  `);

  // Assert the properties rather than trusting the SQL ran as intended. A role created with the
  // wrong attributes is worse than no role, because everything downstream looks correct while the
  // boundary is off. Both roles get the same check: convert_auth owns SECURITY DEFINER functions, so
  // BYPASSRLS on it would turn every one of them into a hole with EXECUTE defaulting to PUBLIC, and
  // G7 would refuse them (ADR 0054).
  const wrong: string[] = [];
  for (const name of ['convert_app', 'convert_auth']) {
    const found = role.rows.find((r) => r.rolname === name);
    if (!found) {
      wrong.push(`${name}: bootstrap ran but the role does not exist`);
      continue;
    }
    if (found.rolsuper) wrong.push(`${name}: is a SUPERUSER, so it bypasses every RLS policy`);
    if (found.rolbypassrls) wrong.push(`${name}: has BYPASSRLS, so it bypasses every RLS policy`);
    if (found.rolcreaterole) wrong.push(`${name}: can CREATE ROLE, which lets it escalate`);
  }
  if (wrong.length > 0) {
    console.error('bootstrap created a role with the wrong attributes:');
    for (const w of wrong) console.error(`  ${w}`);
    process.exit(1);
  }

  console.warn('bootstrap ok - convert_app and convert_auth exist, neither superuser nor BYPASSRLS');
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
