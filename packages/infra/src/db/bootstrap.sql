-- Tenancy bootstrap. Runs before any migration, in every environment.
--
-- ADR 0002 makes row-level security THE tenancy boundary. That is only true if the role
-- the application connects as is actually subject to it, and by default it is not:
--
--   * a superuser ALWAYS bypasses RLS. FORCE ROW LEVEL SECURITY does not help.
--   * a role with BYPASSRLS ALWAYS bypasses RLS. FORCE does not help either.
--   * a table's OWNER bypasses RLS unless the table is marked FORCE ROW LEVEL SECURITY.
--
-- (postgresql.org/docs/16/ddl-rowsecurity.html, verified 2026-08-21.)
--
-- So two roles, not one. The owner runs migrations and owns the tables; the application
-- connects as a role that can neither bypass nor own. See ADR 0042.

-- The application role. NOSUPERUSER and NOBYPASSRLS are the load-bearing words: without
-- them every policy below is decoration.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'convert_app') then
    execute format(
      'create role convert_app login password %L nosuperuser nobypassrls nocreatedb nocreaterole',
      current_setting('convert.app_password')
    );
  else
    execute format(
      'alter role convert_app password %L nosuperuser nobypassrls nocreatedb nocreaterole',
      current_setting('convert.app_password')
    );
  end if;
end
$$;

-- It may read and write rows, and nothing else. No DDL: a role that can ALTER TABLE can
-- turn RLS off, which would make the boundary advisory.
-- GRANT ... ON DATABASE takes a literal name, not a function, so the name has to be
-- interpolated. CONNECT is granted to PUBLIC by default, so this is belt and braces for a
-- database where that has been revoked.
do $$
begin
  execute format('grant connect on database %I to convert_app', current_database());
end
$$;

grant usage on schema public to convert_app;

-- Table privileges are NOT granted here, and there is no ALTER DEFAULT PRIVILEGES for
-- tables. Both used to exist, on the reasoning that a new tenant table should not be
-- silently unreadable by the application. ADR 0050 reversed it: a blanket grant makes
-- every future table fully readable and writable by convert_app whatever TABLE_ACCESS
-- declares about it, so the registry would describe the intent while the database did
-- something else. Silently readable is the worse of the two failures, and the registry
-- now says which tables should be which.
--
-- So each migration grants exactly what its table's TABLE_ACCESS entry declares, and G7
-- compares the two in both directions. A table nobody granted anything on fails loudly
-- at its first query, which is a better failure than one nobody notices.

-- Deleting the statement is not the same as undoing it. Any database where an earlier
-- bootstrap ran still carries the pg_default_acl entry granting CRUD on every future
-- table, and a catalogue entry survives the script that created it - so the first
-- migration there would still hand convert_app blanket access whatever TABLE_ACCESS says.
-- Revoking is the only thing that removes it, the REVOKE has to mirror the original GRANT
-- exactly to match, and this is idempotent: revoking a default privilege that was never
-- granted is a no-op. G7 asserts pg_default_acl is clean afterwards, because this file
-- running is not evidence that it did.
alter default privileges in schema public
  revoke select, insert, update, delete on tables from convert_app;

-- Sequences stay, and should stay unused: ADR 0043 makes the ULID the primary key, so no
-- table needs a serial. The grant costs nothing while there are none and is one less
-- thing to remember if a future table has a genuine reason for one.
grant usage, select on all sequences in schema public to convert_app;
alter default privileges in schema public
  grant usage, select on sequences to convert_app;

-- Explicitly withheld, for the reader: no CREATE on the schema, so convert_app cannot
-- add a table that escapes TABLE_ACCESS, and no ownership, so it cannot disable RLS.
revoke create on schema public from convert_app;
