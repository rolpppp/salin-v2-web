-- Balance adjustments (mobile "Update balances": origin 6, no category, note 'Balance adjustment').
-- Owner's decision: untracked spending taken from Living. Outflow = spend, inflow = negative spend. Never income.
begin;
select plan(37);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('cccccccc-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus") values
  ('acc-a', 'aaaaaaaa-0000-0000-0000-000000000001', 'MariBank', 1, 0, 'PHP', 'i', 1, false, 1, 1, 2),
  ('acc-b', 'bbbbbbbb-0000-0000-0000-000000000002', 'B Cash',   0, 0, 'PHP', 'i', 1, false, 1, 1, 2),
  ('acc-c', 'cccccccc-0000-0000-0000-000000000003', 'C Cash',   0, 0, 'PHP', 'i', 1, false, 1, 1, 2);

-- A: a plan user (Living + Fun + Buffer). B: a just-track user (one bucket "Spending", hue living). C: no buckets yet.
insert into public.buckets (id, user_id, name, "groupKey", hue, "keptInAccountId", planless, "displayOrder") values
  ('b1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Living', 'spend',     'living', 'acc-a', false, 1),
  ('b1000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fun',    'spend',     'fun',    'acc-a', false, 2),
  ('b1000000-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', 'Buffer', 'set_aside', 'buffer', 'acc-a', false, 3),
  ('b1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emergency', 'save', 'emergency', 'acc-a', false, 4),
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Spending', 'spend',   'living', 'acc-b', false, 1);
insert into public.allocation_plans (id, user_id, key, name) values
  ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'A', 'Plan A');
insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000002', 5000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000007', 2000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000008', 1000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000004', 2000);
insert into public.income_sources (id, user_id, name, kind, rule, "landsInAccountId") values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Work', 'salary', 'plan', 'acc-a');
insert into public.user_profiles (user_id, "weekStartsOn", "reviewDay", "onboardedAt") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 1, 0, 1),
  ('bbbbbbbb-0000-0000-0000-000000000002', 1, 0, 1);

create function pg_temp.ago(p_days numeric) returns bigint language sql as $$ select public.now_ms() - (p_days * 86400000)::bigint $$;
create function pg_temp.as_a() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true) $$;
create function pg_temp.as_b() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true) $$;
create function pg_temp.as_c() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true) $$;
-- the phone's row: origin 6, no category, no transfer, note 'Balance adjustment'
create function pg_temp.adjust(p_id text, p_account text, p_dir int, p_amount bigint) returns void language sql as $$
  insert into public.ledger_entries (id, user_id, "accountId", "categoryId", "transferId", "amountMinor", direction, origin, "occurredAt", note, "createdAt", "updatedAt", "syncStatus")
  values (p_id, auth.uid(), p_account, null, null, p_amount, p_dir, 6, public.now_ms(), 'Balance adjustment', 1, 1, 2)
$$;
create function pg_temp.left_of(p_hue text) returns bigint language sql as $$
  select l.left_minor from public.bucket_left() l join public.buckets b on b.id = l.bucket_id where b.hue = p_hue $$;

-- A: one payday of 1,000,000 (Living 500,000 / Fun 300,000 / Buffer 200,000)
insert into public.ledger_entries (id, user_id, "accountId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('inc-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-a', 1000000, 0, 0, public.now_ms() - 86400000, 1, 1, 2);
insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-1', 'd1000000-0000-0000-0000-000000000001', null)
  on conflict (user_id, "ledgerEntryId") do update set "sourceId" = excluded."sourceId";

set local role authenticated;
select pg_temp.as_a();
select is((select count(*)::int from public.confirm_incomes(array['inc-1'])), 4, 'payday confirmed into 4 buckets');
select is(pg_temp.left_of('living'), 500000::bigint, 'Living starts at 500,000');

-- ---------------------------------------------------------------- outflow adjustment = untracked spending from Living
select lives_ok($$select pg_temp.adjust('adj-out-1', 'acc-a', 1, 120000)$$, 'the phone writes an outflow adjustment of 120,000');
select is((select "bucketId"::text || '|' || source from public.entry_buckets where "ledgerEntryId" = 'adj-out-1'), 'b1000000-0000-0000-0000-000000000002|category', 'it is mapped to the Living bucket');
select is(pg_temp.left_of('living'), 380000::bigint, 'Living left drops by the difference (500,000 - 120,000)');
select is((select spent from public.bucket_left() l join public.buckets b on b.id = l.bucket_id where b.hue = 'living'), 120000::bigint, 'and counts as spent');
select is(pg_temp.left_of('fun'), 200000::bigint, 'Fun is untouched');

-- ---------------------------------------------------------------- never income
select is((select count(*)::int from public.income_meta where "ledgerEntryId" = 'adj-out-1'), 0, 'no income_meta row for an outflow adjustment');
select lives_ok($$select pg_temp.adjust('adj-in-1', 'acc-a', 0, 20000)$$, 'an inflow adjustment of 20,000');
select is((select count(*)::int from public.income_meta where "ledgerEntryId" = 'adj-in-1'), 0, 'no income_meta row for an inflow adjustment (recognition trigger skips it)');
select is((select count(*)::int from public.income_meta), 1, 'income_meta holds only the real payday');
select is((select count(*)::int from public.engine_waiting_income(auth.uid())), 0, 'nothing is waiting for a job');
select throws_ok($$select * from public.confirm_incomes(array['adj-in-1'])$$, 'P0002', null, 'confirm_incomes refuses an inflow adjustment');
select is((select waiting_count from public.tab_badges(current_date)), 0, 'the Money in badge stays at 0');
-- even if a stray income_meta row existed, it is still not waiting income
insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job) values (auth.uid(), 'adj-in-1', 'd1000000-0000-0000-0000-000000000001', null);
select is((select count(*)::int from public.engine_waiting_income(auth.uid())), 0, 'a stray income_meta row on an adjustment is still not waiting income');
delete from public.income_meta where "ledgerEntryId" = 'adj-in-1';

-- ---------------------------------------------------------------- inflow adjustment = negative spending
select is(pg_temp.left_of('living'), 400000::bigint, 'the inflow adjustment adds 20,000 back to Living (500,000 - 120,000 + 20,000)');
select is((select spent from public.bucket_left() l join public.buckets b on b.id = l.bucket_id where b.hue = 'living'), 100000::bigint, 'net spent = 120,000 - 20,000');

-- ---------------------------------------------------------------- bigger than Living: left goes negative, a cover fixes it
select lives_ok($$select pg_temp.adjust('adj-out-2', 'acc-a', 1, 450000)$$, 'an outflow adjustment bigger than what is left');
select is(pg_temp.left_of('living'), -50000::bigint, 'Living is below zero (Needs 500.00)');
select lives_ok($$select public.cover_bucket('b1000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000002', 50000)$$, 'cover from Buffer');
select is(pg_temp.left_of('living'), 0::bigint, 'covered back to zero');

-- ---------------------------------------------------------------- Review: identity holds, adjustments are not "came in", slip names them
create temp table slip as select * from public.week_slip_figures(pg_temp.ago(3));
grant select on slip to authenticated;
select is((select came_in_week from slip), 1000000::bigint, 'Came in = the payday only (adjustments are not income)');
select is((select spent_week from slip), 550000::bigint, 'Spent = 120,000 - 20,000 + 450,000 (the inflow adjustment is negative)');
select is(
  (select s.came_in_week from slip s),
  (select s.spent_week + s.to_assign + (select sum(l.left_minor)::bigint from public.bucket_left() l) from slip s),
  'IDENTITY: Came in = Spent + sum(left) + To assign with adjustments in the books');
select is((select category_name || ':' || amount_minor from public.week_category_spend(pg_temp.ago(3), pg_temp.ago(-1)) limit 1), 'Balance adjustment:550000', 'the week slip names them "Balance adjustment", net of the inflow one');
select is((select spent_minor from public.week_bucket_flows(pg_temp.ago(3), pg_temp.ago(-1)) f join public.buckets b on b.id = f.bucket_id where b.hue = 'living'), 550000::bigint, 'week flows: Living spent includes the adjustments');

-- ---------------------------------------------------------------- soft delete removes it; restore brings it back
update public.ledger_entries set "deletedAt" = 5 where id = 'adj-out-2';
select is(pg_temp.left_of('living'), 450000::bigint, 'soft-deleting the big adjustment gives it back (500,000 - 100,000 + 50,000 cover)');
update public.ledger_entries set "deletedAt" = null where id = 'adj-out-2';
select is(pg_temp.left_of('living'), 0::bigint, 'restoring it counts it again');

-- ---------------------------------------------------------------- just-track user: the one "Spending" bucket
select pg_temp.as_b();
select lives_ok($$select pg_temp.adjust('adj-b-1', 'acc-b', 1, 5000)$$, 'B (just tracking) gets an outflow adjustment');
select is((select "bucketId"::text from public.entry_buckets where "ledgerEntryId" = 'adj-b-1'), 'b2000000-0000-0000-0000-000000000001', 'it lands in the one Spending bucket');

-- ---------------------------------------------------------------- no buckets yet: nothing; buckets later: mapped (idempotent)
select pg_temp.as_c();
select lives_ok($$select pg_temp.adjust('adj-c-1', 'acc-c', 1, 700)$$, 'C (no buckets) gets an adjustment');
select is((select count(*)::int from public.entry_buckets), 0, 'with no buckets there is nothing to map');
insert into public.buckets (id, user_id, name, "groupKey", hue, planless, "displayOrder") values
  ('b3000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'Spending', 'spend', 'living', false, 1);
select is((select "bucketId"::text from public.entry_buckets where "ledgerEntryId" = 'adj-c-1'), 'b3000000-0000-0000-0000-000000000001', 'once the spend bucket exists the adjustment is mapped');
select is(public.backfill_adjustment_buckets(), 0, 'the backfill is idempotent');
select is(pg_temp.left_of('living'), -700::bigint, 'C: Spending left = -700');

-- ---------------------------------------------------------------- isolation
select pg_temp.as_b();
select is((select count(*)::int from public.entry_buckets), 1, 'B sees only its own entry_buckets row');
select is(pg_temp.left_of('living'), -5000::bigint, 'B''s Spending reflects only B''s adjustment');

select * from finish();
rollback;
