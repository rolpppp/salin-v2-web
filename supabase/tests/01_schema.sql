begin;
select plan(91);

-- mobile-synced tables (live baseline) + media + backups, and every web table
select has_table('public'::name, t::name) from unnest(array[
  'accounts','categories','ledger_entries','transfers','budgets','budget_categories',
  'recurring_rules','recurring_instances','contacts','debts','splits','split_participants',
  'media','backups',
  'user_profiles','buckets','allocation_plans','allocation_plan_lines','allocation_rules',
  'income_sources','income_source_split_lines','income_meta','allocations','transfer_checks',
  'category_buckets','entry_buckets','bucket_covers','goals','week_reviews','events']) as t;   -- 30

select hasnt_table('public', 'fx_rates', 'fx_rates is Phase 2');
select hasnt_table('public', 'balance_snapshots', 'balance_snapshots is Phase 2');

-- RLS enabled on every public table
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0,
          'RLS is enabled on every public table');                                    -- 1

-- key columns / types / pks
select col_is_pk('buckets'::name, 'id'::name);
select col_is_pk('user_profiles'::name, 'user_id'::name);
select col_type_is('public'::name, 'allocations'::name, 'amountMinor'::name, 'bigint');
select col_type_is('public'::name, 'allocations'::name, 'createdAt'::name, 'bigint');
select col_type_is('public'::name, 'allocations'::name, 'ruleTrace'::name, 'jsonb');
select col_type_is('public'::name, 'events'::name, 'props'::name, 'jsonb');
select col_type_is('public'::name, 'events'::name, 'occurredAt'::name, 'bigint');
select col_type_is('public'::name, 'user_profiles'::name, 'onboardingDraft'::name, 'jsonb');
select col_type_is('public'::name, 'user_profiles'::name, 'nextPaydayDate'::name, 'date');
select col_type_is('public'::name, 'income_meta'::name, 'ledgerEntryId'::name, 'text');
select col_type_is('public'::name, 'buckets'::name, 'keptInAccountId'::name, 'text');
select col_not_null('allocations'::name, 'user_id'::name);
select col_has_default('allocations'::name, 'user_id'::name);
select col_has_default('buckets'::name, 'id'::name);                                   -- 13 above

-- every web table has user_id + camelCase timestamps (events has no updatedAt by design)
select has_column(t::name, 'user_id'::name) from unnest(array[
  'buckets','allocation_plans','allocation_plan_lines','allocation_rules','income_sources',
  'income_source_split_lines','income_meta','allocations','transfer_checks','category_buckets',
  'entry_buckets','bucket_covers','goals','week_reviews','events','user_profiles']) as t;  -- 16
select has_column(t::name, 'updatedAt'::name) from unnest(array[
  'buckets','allocation_plans','allocation_plan_lines','allocation_rules','income_sources',
  'income_source_split_lines','income_meta','allocations','transfer_checks','category_buckets',
  'entry_buckets','bucket_covers','goals','week_reviews','user_profiles']) as t;          -- 15

-- unique constraints / indexes
select has_index('public', 'income_meta', 'income_meta_user_id_ledgerEntryId_key', array['user_id','"ledgerEntryId"']);
select has_index('public', 'category_buckets', 'category_buckets_user_id_categoryId_key', array['user_id','"categoryId"']);
select has_index('public', 'entry_buckets', 'entry_buckets_user_id_ledgerEntryId_key', array['user_id','"ledgerEntryId"']);
select has_index('public'::name, 'allocation_plans'::name, 'allocation_plans_user_key_active_uq'::name);
select has_index('public', 'ledger_entries', 'ledger_entries_user_occurred_idx', array['user_id','"occurredAt"']);

-- web FKs to mobile tables never block a mobile delete (CASCADE 'c' or SET NULL 'n' only)
select is((select count(*)::int from pg_constraint k
           where k.contype = 'f'
             and k.conrelid::regclass::text in ('allocations','buckets','income_sources','income_meta','transfer_checks','category_buckets','entry_buckets')
             and k.confrelid::regclass::text in ('accounts','categories','ledger_entries','transfers')
             and k.confdeltype not in ('c','n')), 0,
          'web FKs to mobile tables are CASCADE or SET NULL only');
select cmp_ok((select count(*)::int from pg_constraint k
           where k.contype = 'f' and k.conrelid = 'public.allocations'::regclass
             and k.confrelid = 'public.ledger_entries'::regclass), '=', 1, 'allocations -> ledger_entries FK exists');

-- check constraints
insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into public.buckets (id, user_id, name, "groupKey") values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Living', 'spend');
insert into public.allocation_plans (id, user_id, key, name) values
  ('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'A', 'Plan A');

select lives_ok($$insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp")
  values ('aaaaaaaa-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001', 10000)$$,
  'percentBp 10000 accepted');
select throws_ok($$insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp")
  values ('aaaaaaaa-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001', 10001)$$,
  '23514', null, 'percentBp 10001 rejected');
select throws_ok($$insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp")
  values ('aaaaaaaa-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001', -1)$$,
  '23514', null, 'percentBp -1 rejected');
select throws_ok($$insert into public.buckets (user_id, name, "groupKey") values ('aaaaaaaa-0000-0000-0000-000000000001','x','bogus')$$,
  '23514', null, 'bucket groupKey CHECK');
select throws_ok($$insert into public.allocation_plans (user_id, key, name) values ('aaaaaaaa-0000-0000-0000-000000000001','A','dup')$$,
  '23505', null, 'one active plan key per user');
select throws_ok($$insert into public.income_sources (user_id, name, rule) values ('aaaaaaaa-0000-0000-0000-000000000001','s','bogus')$$,
  '23514', null, 'income source rule CHECK');

select * from finish();
rollback;
