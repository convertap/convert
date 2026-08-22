#!/usr/bin/env bash
# Re-prove, on the Postgres major this repository declares, every database behaviour an
# accepted ADR measured on an older one. Run this when .postgres-version moves, which is the
# only time the question arises: ADR 0053 makes the major the decision and the minor evidence,
# so a minor release needs nothing and a major needs all of it.
#
# It starts a throwaway container on port 55432 so a running local Postgres is left alone,
# and it only reads and writes fixtures it creates. Output goes to a report; paste the
# relevant numbers into the ADR that records the move.
#
#   bash tools/reprove_postgres_behaviour.sh
#
# Covers: ADR 0042 (RLS applies to convert_app, the derived policy expression, the naive-form
# fail injection), ADR 0044 (enum ordering), ADR 0046 (column conventions and its inverse),
# ADR 0050 (a plain view leaks), ADR 0051 (invoker rights), ADR 0052 (the owner must bypass).
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_MAJOR="$(tr -d '[:space:]' < "$REPO/.postgres-version")"
OUT="$REPO/.reports/postgres-${PG_MAJOR}-proofs.md"
C=convert-pg-proof
PW=convert-app-local

mkdir -p "$REPO/.reports"
: > "$OUT"
cd "$REPO" || exit 1

export APP_DB_PASSWORD="$PW"
export DATABASE_URL="postgres://postgres:postgres@localhost:55432/convert"
export DATABASE_URL_APP="postgres://convert_app:$PW@localhost:55432/convert"

h()  { printf '\n\n## %s\n\n' "$*" >> "$OUT"; }
run() { printf '```\n$ %s\n' "$*" >> "$OUT"; "$@" >> "$OUT" 2>&1; printf 'exit: %s\n```\n' "$?" >> "$OUT"; }
sqlf() { printf '```sql\n' >> "$OUT"; cat "$1" >> "$OUT"; printf '```\n\n```\n' >> "$OUT";
         docker exec -i -e PGPASSWORD=postgres "$C" psql -U postgres -d convert -v ON_ERROR_STOP=1 -f - < "$1" >> "$OUT" 2>&1
         printf 'exit: %s\n```\n' "$?" >> "$OUT"; }

T=$(mktemp -d)

h "Container"
docker rm -f "$C" >/dev/null 2>&1
run docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=convert -p 55432:5432 postgres:$PG_MAJOR
docker exec "$C" bash -c 'for i in $(seq 60); do pg_isready -U postgres -q && exit 0; sleep 1; done; exit 1'
printf '\npg_isready: %s\n' "$?" >> "$OUT"

# Abort before proving anything rather than prove it against the wrong server. If port 55432 is
# already taken - a leftover container from an earlier run is the usual cause - `docker run`
# fails and every connection below lands on whatever is already listening. That happened on the
# first run of this script: `assert:rls` reported a pass against a stale container, which is the
# defect class ADR 0048 exists to name.
SERVED=$(docker exec "$C" psql -U postgres -d convert -tAc 'show server_version' 2>/dev/null | tr -d '[:space:]')
case "$SERVED" in
  "$PG_MAJOR" | "$PG_MAJOR".*) printf 'serving: %s\n' "$SERVED" >> "$OUT" ;;
  *) printf '\nABORT: %s serves %s, expected major %s. Nothing was proved.\n' \
       "$C" "${SERVED:-nothing}" "$PG_MAJOR" | tee -a "$OUT"
     printf 'Something else on port 55432? Check: docker ps --filter publish=55432\n' | tee -a "$OUT"
     exit 1 ;;
esac

h "Server version"
cat > "$T/version.sql" <<'SQL'
select version();
SQL
sqlf "$T/version.sql"

h "Bootstrap the application role"
run pnpm --filter @convert/infra bootstrap

h "P1a - assert:rls on the empty schema (G7, ten subchecks)"
run pnpm --filter @convert/infra assert:rls

h "P1b - the canonical policy expression, derived from the server"
cat > "$T/fixture.sql" <<'SQL'
create table lead (
  id uuid primary key,
  workspace_id uuid not null,
  name text not null
);
alter table lead enable row level security;
alter table lead force row level security;
create policy tenant_isolation on lead
  using (workspace_id = nullif(current_setting('app.current_workspace', true), '')::uuid);
grant select on lead to convert_app;

insert into lead values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000aa', 'tenant A lead'),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000bb', 'tenant B lead');

select pg_get_expr(polqual, polrelid) as derived_expression
from pg_policy where polname = 'tenant_isolation';
SQL
sqlf "$T/fixture.sql"

h "P4 and P5 - a plain view leaks, security_invoker does not, a matview cannot be fixed (ADR 0050, ADR 0051)"
cat > "$T/views.sql" <<'SQL'
create view v_default as select * from lead;
create view v_invoker with (security_invoker = true) as select * from lead;
create materialized view mv as select * from lead;
grant select on v_default, v_invoker, mv to convert_app;

set role convert_app;
select set_config('app.current_workspace', '00000000-0000-0000-0000-0000000000aa', false);
select 'lead (the table)' as relation, count(*) as rows_visible from lead
union all select 'v_default', count(*) from v_default
union all select 'v_invoker', count(*) from v_invoker
union all select 'mv', count(*) from mv
order by 1;
reset role;

-- the owner control: with BYPASSRLS it must see both rows (ADR 0052)
select 'owner sees' as who, count(*) as rows_visible from lead;
SQL
sqlf "$T/views.sql"

h "P1c - the naive policy without nullif, on an empty context (the fail-injection)"
cat > "$T/naive.sql" <<'SQL'
drop policy tenant_isolation on lead;
create policy tenant_isolation on lead
  using (workspace_id = current_setting('app.current_workspace', true)::uuid);
select pg_get_expr(polqual, polrelid) as naive_expression
from pg_policy where polname = 'tenant_isolation';

set role convert_app;
select set_config('app.current_workspace', '', false);
select count(*) from lead;   -- expected: an error, not an empty result
reset role;
SQL
sqlf "$T/naive.sql"

h "P1c control - the canonical form on the same empty context returns nothing instead of raising"
cat > "$T/canonical.sql" <<'SQL'
drop policy tenant_isolation on lead;
create policy tenant_isolation on lead
  using (workspace_id = nullif(current_setting('app.current_workspace', true), '')::uuid);
set role convert_app;
select set_config('app.current_workspace', '', false);
select count(*) as rows_visible_with_empty_context from lead;
reset role;
SQL
sqlf "$T/canonical.sql"

h "P2 - enum ordering sorts by declaration, casting to text loses it (ADR 0044)"
cat > "$T/enum.sql" <<'SQL'
create type deal_stage as enum ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost');
create table deal_probe (id int primary key, stage deal_stage not null);
insert into deal_probe values (1,'won'), (2,'new'), (3,'proposal'), (4,'contacted'), (5,'lost'), (6,'qualified');

select 'order by stage' as ordering, string_agg(stage::text, ' < ' order by stage) as sequence from deal_probe
union all
select 'order by stage::text', string_agg(stage::text, ' < ' order by stage::text) from deal_probe;
SQL
sqlf "$T/enum.sql"

h "P3 - the column-conventions probe (ADR 0046)"
cat > "$T/conventions.sql" <<'SQL'
drop view if exists v_default, v_invoker;
drop materialized view if exists mv;
drop table if exists lead, deal_probe;
drop type if exists deal_stage;

create table conventions_probe (
  id uuid primary key,
  workspace_id uuid not null,
  amount_pesewas numeric(12,2) not null,
  rate_bp bigint not null,
  happened_at timestamp not null,
  deleted_at timestamptz
);
grant select, insert, update on conventions_probe to convert_app;
SQL
sqlf "$T/conventions.sql"
run pnpm --filter @convert/infra assert:conventions

h "P3 inverse - UPDATE revoked while updated_at is present"
cat > "$T/conventions2.sql" <<'SQL'
drop table conventions_probe;
create table conventions_probe (
  id uuid primary key,
  workspace_id uuid not null,
  amount_pesewas bigint not null,
  rate_bp bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert on conventions_probe to convert_app;   -- no UPDATE
SQL
sqlf "$T/conventions2.sql"
run pnpm --filter @convert/infra assert:conventions

h "Clean the probes back off"
cat > "$T/clean.sql" <<'SQL'
drop table if exists conventions_probe;
SQL
sqlf "$T/clean.sql"

h "P6 - a non-bypassing owner must make assert:rls exit 3 (ADR 0052)"
cat > "$T/owner.sql" <<'SQL'
drop role if exists weak_owner;
create role weak_owner login password 'weak-owner-local' nosuperuser nobypassrls;
grant all on database convert to weak_owner;
grant usage, create on schema public to weak_owner;
SQL
sqlf "$T/owner.sql"
printf '```\n$ DATABASE_URL=<weak_owner> pnpm --filter @convert/infra assert:rls\n' >> "$OUT"
DATABASE_URL="postgres://weak_owner:weak-owner-local@localhost:55432/convert" \
  pnpm --filter @convert/infra assert:rls >> "$OUT" 2>&1
printf 'exit: %s\n```\n' "$?" >> "$OUT"

h "G16"
run python tools/check_pg_version.py

printf '\n\n(proof container %s left running; remove with: docker rm -f %s)\n' "$C" "$C" >> "$OUT"
echo "done -> $OUT"
