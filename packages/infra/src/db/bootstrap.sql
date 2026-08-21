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
grant select, insert, update, delete on all tables in schema public to convert_app;
grant usage, select on all sequences in schema public to convert_app;

-- And on everything migrations create later, so a new tenant table is not silently
-- unreadable by the application.
alter default privileges in schema public
  grant select, insert, update, delete on tables to convert_app;
alter default privileges in schema public
  grant usage, select on sequences to convert_app;

-- Explicitly withheld, for the reader: no CREATE on the schema, so convert_app cannot
-- add a table that escapes TENANT_TABLES, and no ownership, so it cannot disable RLS.
revoke create on schema public from convert_app;
