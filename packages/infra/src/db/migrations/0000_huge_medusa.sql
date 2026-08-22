CREATE TYPE "public"."consent_channel" AS ENUM('whatsapp', 'sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."invoice_state" AS ENUM('draft', 'issued');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('whatsapp', 'facebook', 'instagram', 'phone', 'web', 'offline');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'converted', 'lost');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'sales_rep');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_origin" AS ENUM('manual', 'psp');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('product', 'service');--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text,
	"email" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_phone_unique" UNIQUE("phone"),
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_has_an_identifier" CHECK ("user"."phone" is not null or "user"."email" is not null)
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_member" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_member_one_per_workspace" UNIQUE("workspace_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_member_by_user" ON "workspace_member" USING btree ("user_id");--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Tenancy. Everything below is hand-written: drizzle-kit generates tables and never policies,
-- and the tenancy guarantee lives in this half of the file (ADR 0002, ADR 0017).
--
-- The policy text is not free-hand. It is what `canonicalPolicySql` and `authReaderPolicySql` in
-- src/db/access.ts produce for each TABLE_ACCESS entry, printed from the registry rather than
-- typed, so the two cannot drift. G7 compares what is live against the same functions and fails on
-- any difference. Every relation name is quoted because `user` is a reserved word: unquoted, it is
-- the keyword meaning current_user, and `on user` is a syntax error.
--
-- The enum types above include several with no table yet. drizzle-kit emits every declared pgEnum,
-- and landing them now costs nothing and saves later migrations from creating them.
-- ---------------------------------------------------------------------------------------------

alter table "workspace" enable row level security;--> statement-breakpoint
alter table "workspace" force row level security;--> statement-breakpoint
create policy workspace_scope
  on "workspace"
  as permissive
  for all
  to convert_app
  using (id = nullif(current_setting('app.current_workspace', true), '')::uuid);--> statement-breakpoint
grant select, update on "workspace" to convert_app;--> statement-breakpoint

alter table "user" enable row level security;--> statement-breakpoint
alter table "user" force row level security;--> statement-breakpoint
create policy user_scope
  on "user"
  as permissive
  for all
  to convert_app
  using (id = nullif(current_setting('app.current_user', true), '')::uuid);--> statement-breakpoint
create policy auth_reader
  on "user"
  as permissive
  for select
  to convert_auth
  using (true);--> statement-breakpoint
grant select, update on "user" to convert_app;--> statement-breakpoint
-- The lookup role needs the GRANT as well as the policy. A policy filters rows; a grant
-- permits the operation, and without this the definer function fails with 'permission denied
-- for table user' no matter what auth_reader says. Two green gates missed it because neither
-- called the function; a behavioural probe found it immediately.
grant select on "user" to convert_auth;--> statement-breakpoint

alter table "workspace_member" enable row level security;--> statement-breakpoint
alter table "workspace_member" force row level security;--> statement-breakpoint
create policy workspace_scope
  on "workspace_member"
  as permissive
  for all
  to convert_app
  using (workspace_id = nullif(current_setting('app.current_workspace', true), '')::uuid);--> statement-breakpoint
grant select, insert, update on "workspace_member" to convert_app;--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- The identity read path (ADR 0054).
--
-- Sign-in runs before any principal exists, so `app.current_user` is empty and user_scope returns
-- nothing. These functions answer the lookup instead. They are owned by convert_auth, which the
-- auth_reader policy above lets read every account, and they each constrain their own result to one
-- row. convert_app holds EXECUTE and no privilege that would let it read the table this way.
--
-- Three details are load-bearing:
--   * `security definer` with `set search_path = ''`, which removes the caller's ordinary schemas.
--     It is not the whole guarantee: Postgres still searches an existing temporary schema for
--     relation names, so what actually makes these safe is that every name inside is
--     schema-qualified, and that bootstrap revokes TEMP from PUBLIC. Review demonstrated the
--     difference by shadowing an unqualified name from a temp schema.
--   * ownership transferred to convert_auth. Left owned by the migration owner, which bypasses RLS
--     (ADR 0052), each function would be a hole and G7 would refuse it.
--   * EXECUTE revoked from PUBLIC before it is granted. EXECUTE defaults to PUBLIC on a new
--     function, so granting without revoking leaves it callable by everyone.
-- ---------------------------------------------------------------------------------------------

create function public.auth_find_user_by_phone(p_phone text)
  returns table (id uuid, phone text)
  language sql
  stable
  security definer
  set search_path = ''
  as $$
    select u.id, u.phone from public."user" u where u.phone = p_phone
  $$;--> statement-breakpoint
alter function public.auth_find_user_by_phone(text) owner to convert_auth;--> statement-breakpoint
revoke execute on function public.auth_find_user_by_phone(text) from public;--> statement-breakpoint
grant execute on function public.auth_find_user_by_phone(text) to convert_app;--> statement-breakpoint

create function public.auth_find_user_by_email(p_email text)
  returns table (id uuid, email text)
  language sql
  stable
  security definer
  set search_path = ''
  as $$
    select u.id, u.email from public."user" u where u.email = p_email
  $$;--> statement-breakpoint
alter function public.auth_find_user_by_email(text) owner to convert_auth;--> statement-breakpoint
revoke execute on function public.auth_find_user_by_email(text) from public;--> statement-breakpoint
grant execute on function public.auth_find_user_by_email(text) to convert_app;
