-- Native-Postgres stand-in for the bits of Supabase our migrations and pgTAP tests use
-- (decision P-7). Applied by scripts/db-local.sh before the migrations; never shipped.
-- Covers: the postgres/anon/authenticated/service_role roles, auth.users, auth.uid(),
-- auth.role(), auth.jwt(), and pgTAP in the `extensions` schema.
-- Not covered: GoTrue, PostgREST, Realtime. Anything needing those uses `supabase start`.

-- Roles are cluster-wide; create only what's missing, with Supabase's attributes.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'postgres') then
    create role postgres nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;
grant usage on schema auth, extensions to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  instance_id uuid,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
grant select on auth.users to service_role;

-- Same definitions Supabase ships: read the PostgREST request claims.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on all functions in schema auth to anon, authenticated, service_role;

create extension if not exists pgtap with schema extensions;
grant execute on all functions in schema extensions to anon, authenticated, service_role;
