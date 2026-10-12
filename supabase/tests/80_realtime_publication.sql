-- Realtime publication: the tables whose changes refresh the open web page, with RLS on each (postgres_changes filters by RLS).
begin;
select plan(29);

select ok(exists (select 1 from pg_publication where pubname = 'supabase_realtime'), 'supabase_realtime publication exists');

select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t), t || ' is published')
  from unnest(array[
    'ledger_entries', 'accounts', 'categories', 'transfers',
    'allocations', 'transfer_checks', 'bucket_covers', 'income_meta', 'week_reviews', 'user_profiles',
    'buckets', 'allocation_plans', 'allocation_plan_lines', 'income_sources'
  ]) as t;

select ok((select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || ' has RLS enabled')
  from unnest(array[
    'ledger_entries', 'accounts', 'categories', 'transfers',
    'allocations', 'transfer_checks', 'bucket_covers', 'income_meta', 'week_reviews', 'user_profiles',
    'buckets', 'allocation_plans', 'allocation_plan_lines', 'income_sources'
  ]) as t;

select finish();
rollback;
