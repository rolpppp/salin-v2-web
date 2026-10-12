-- Realtime: the open web page refreshes when the phone syncs or another tab writes.
-- Adds tables to the supabase_realtime publication only. No column, policy or REPLICA IDENTITY change:
-- the client just calls router.refresh() on any change, so it never needs the old row. Realtime
-- postgres_changes applies each table's RLS SELECT policy for the subscriber's JWT (own rows only).
-- Idempotent: creates the publication if missing (plain Postgres), skips tables already in it.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'ledger_entries', 'accounts', 'categories', 'transfers',
    'allocations', 'transfer_checks', 'bucket_covers', 'income_meta', 'week_reviews', 'user_profiles',
    'buckets', 'allocation_plans', 'allocation_plan_lines', 'income_sources'
  ] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
