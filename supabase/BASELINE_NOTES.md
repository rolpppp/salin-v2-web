# Baseline notes

`migrations/20261011000000_baseline.sql` is a verbatim `pg_dump` of the live `salin-v2` `public` schema (2026-10-11). Mobile owns these tables; do not edit them.

## Changes made to make the dump apply locally

Only one, appended at the very end of the file:

- `SELECT pg_catalog.set_config('search_path', '"$user", public, extensions', false);` The dump sets an empty `search_path` for the whole session; without the reset, later migrations in the same session would run with an empty path.

Nothing else needed changing. The dump applied cleanly on a fresh local stack, including `ALTER ... OWNER TO`, grants and the `rls_auto_enable()` function. The dump contains the `rls_auto_enable()` function but NOT its event trigger (event triggers are not in a `public` schema dump), so locally the function exists and nothing calls it. New tables get `enable row level security` explicitly in the web migration.

## What the real schema is

- 12 synced tables + `media` + `backups`. camelCase quoted columns, `user_id uuid` -> `auth.users ON DELETE CASCADE`, text PK `id` (backups: PK `(user_id, name)`, no id), Drift ints as `bigint`, bools as `boolean`, enums as `bigint`.
- Real FKs between mobile tables (ledger_entries -> accounts CASCADE, -> categories/debts/splits/transfers/recurring_instances SET NULL, etc.).
- RLS on all 14 tables with one policy each: `FOR ALL USING (auth.uid() = user_id)` (no explicit WITH CHECK, so USING doubles as the check). DELETE is therefore allowed by RLS; "never hard-delete" is an app rule.
- Grants: ALL to anon, authenticated, service_role (RLS is the guard).
- No `updatedAt` triggers, no indexes beyond PKs.

## Where my earlier reconstruction differed

- Policies: I had separate select/insert/update policies and no delete. Live is one `FOR ALL` policy.
- FKs: I had none between mobile tables. Live has them.
- `backups`: I had a uuid `id` PK. Live PK is `(user_id, name)`.
- `media` was absent from my reconstruction (I treated it as local only). It exists remotely.
- I added `(user_id, "updatedAt")` indexes on every synced table. Live has none (not carried over).
- Column types, nullability and names matched Drift as I guessed (bigint ints, text ids).

## Local-only environment note

The `public.ecr.aws/supabase/postgres:17.6.1.165` image pulled on this machine is broken (0-byte `docker-entrypoint.sh`, "exec format error"). `supabase/.temp/postgres-version` is pinned to `17.6.1.147` (gitignored, local) so `supabase start` works. Delete that file once a good 17.6.1.165 image is available.
