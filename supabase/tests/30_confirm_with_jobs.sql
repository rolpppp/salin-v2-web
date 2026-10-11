-- confirm_incomes_with_jobs: picks are saved and the confirm happens in one transaction.
begin;
select plan(24);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus") values
  ('acc-bank', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bank',   1, 0, 'PHP', 'i', 1, false, 1, 1, 2),
  ('acc-cash', 'aaaaaaaa-0000-0000-0000-000000000001', 'Cash',   0, 0, 'PHP', 'i', 2, false, 1, 1, 2),
  ('acc-b',    'bbbbbbbb-0000-0000-0000-000000000002', 'B Bank', 1, 0, 'PHP', 'i', 1, false, 1, 1, 2);

insert into public.buckets (id, user_id, name, "groupKey", hue, "keptInAccountId", planless, "displayOrder") values
  ('b1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Living',    'spend',     'living',    'acc-cash', false, 1),
  ('b1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rent',      'set_aside', 'rent',      'acc-bank', false, 2),
  ('b1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emergency', 'save',      'emergency', 'acc-bank', false, 3),
  ('b1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fun',       'spend',     'fun',       'acc-cash', false, 4),
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Emergency', 'save',      'emergency', 'acc-b',    false, 1);

insert into public.allocation_plans (id, user_id, key, name) values
  ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'A', 'Plan A');
-- Plan A: living 50, rent 5, emergency 30, fun 15
insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000001', 5000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000002', 500),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000003', 3000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000004', 1500);
insert into public.allocation_rules (user_id, kind, params) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'switch_on_goal',
     '{"fromPlan":"A","toPlan":"B","bucketId":"b1000000-0000-0000-0000-000000000003","targetMinor":5000000}'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'redirect_until_date',
     '{"fromBucketId":"b1000000-0000-0000-0000-000000000002","toBucketId":"b1000000-0000-0000-0000-000000000003","untilDate":"2027-01-01"}');

insert into public.income_sources (id, user_id, name, kind, rule, "wholeBucketId", "landsInAccountId") values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asker',  'gift',  'ask',  null, 'acc-bank'),
  ('d1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Salary', 'salary','plan', null, 'acc-bank');

create function pg_temp.ms(d text) returns bigint language sql as $$ select (extract(epoch from (d || ' 12:00:00+08')::timestamptz) * 1000)::bigint $$;
insert into public.ledger_entries (id, user_id, "accountId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('i-plan',  'aaaaaaaa-0000-0000-0000-000000000001', 'acc-bank', 100000, 0, 0, pg_temp.ms('2026-10-10'), 1, 1, 2),
  ('i-one',   'aaaaaaaa-0000-0000-0000-000000000001', 'acc-bank',  20000, 0, 0, pg_temp.ms('2026-10-10'), 1, 1, 2),
  ('i-rule',  'aaaaaaaa-0000-0000-0000-000000000001', 'acc-bank',  50000, 0, 0, pg_temp.ms('2026-10-10'), 1, 1, 2),
  ('i-ask',   'aaaaaaaa-0000-0000-0000-000000000001', 'acc-bank',   5000, 0, 0, pg_temp.ms('2026-10-10'), 1, 1, 2),
  ('i-rent',  'aaaaaaaa-0000-0000-0000-000000000001', 'acc-bank',   7000, 0, 0, pg_temp.ms('2026-10-10'), 1, 1, 2),
  ('i-b',     'bbbbbbbb-0000-0000-0000-000000000002', 'acc-b',      9000, 0, 0, pg_temp.ms('2026-10-10'), 1, 1, 2);
insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'i-plan', 'd1000000-0000-0000-0000-000000000001', null),  -- Asker: needs a pick
  ('aaaaaaaa-0000-0000-0000-000000000001', 'i-one',  'd1000000-0000-0000-0000-000000000001', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'i-rule', 'd1000000-0000-0000-0000-000000000002', 'one'), -- an earlier pick we clear
  ('aaaaaaaa-0000-0000-0000-000000000001', 'i-ask',  'd1000000-0000-0000-0000-000000000001', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'i-rent', 'd1000000-0000-0000-0000-000000000001', null);

create function pg_temp.as_a() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true) $$;

select ok(has_function_privilege('authenticated', 'public.confirm_incomes_with_jobs(text[], jsonb)', 'execute'), 'authenticated can execute');
select ok(not has_function_privilege('anon', 'public.confirm_incomes_with_jobs(text[], jsonb)', 'execute'), 'anon cannot execute');

set local role authenticated;
select pg_temp.as_a();

-- ---- refusals roll the picks back (atomic)
select throws_like($$select * from confirm_incomes_with_jobs(array['i-ask'], '[{"id":"i-ask","job":null}]')$$, '%Needs a job%', 'no pick and rule ask: refused');
select throws_ok($$select * from confirm_incomes_with_jobs(array['i-plan'], '[{"id":"i-other","job":"plan"}]')$$, '22023', null, 'a pick for an income not in the list: refused');
select throws_ok($$select * from confirm_incomes_with_jobs(array['i-plan'], '[{"id":"i-plan","job":"banana"}]')$$, '22023', null, 'unknown job: refused');
select throws_ok($$select * from confirm_incomes_with_jobs(array['i-plan'], '{"id":"i-plan"}')$$, '22023', null, 'p_jobs must be an array');
select throws_like($$select * from confirm_incomes_with_jobs(array['i-rent'], '[{"id":"i-rent","job":"one","oneBucketId":"b1000000-0000-0000-0000-000000000002"}]')$$,
  '%Rent cannot be picked%', 'Rent cannot be picked for a one-off');
select is((select job from public.income_meta where "ledgerEntryId" = 'i-rent'), null, 'the refused Rent pick was rolled back');
select is((select count(*)::int from public.allocations), 0, 'refusals wrote no allocations');
select throws_ok($$select * from confirm_incomes_with_jobs(array['i-b'], '[{"id":"i-b","job":"plan"}]')$$, 'P0002', null, 'another user''s income: refused');

-- ---- picks are saved and used
select is((select count(*)::int from confirm_incomes_with_jobs(array['i-plan'], '[{"id":"i-plan","job":"plan"}]')), 3,
  'a plan pick on an ask source confirms: living, emergency (with the rent redirect), fun');
select is((select jsonb_object_agg(b.hue, a."amountMinor") from public.allocations a join public.buckets b on b.id = a."bucketId" where a."ledgerEntryId" = 'i-plan'),
  '{"living":50000,"emergency":35000,"fun":15000}'::jsonb, 'split by plan A with the rent redirect');
select is((select job from public.income_meta where "ledgerEntryId" = 'i-plan'), 'plan', 'the pick is stored on income_meta');
select is((select "planKey" from public.allocations where "ledgerEntryId" = 'i-plan' limit 1), 'A', 'the plan used is snapshotted');

select is((select count(*)::int from confirm_incomes_with_jobs(array['i-one'], '[{"id":"i-one","job":"one","oneBucketId":"b1000000-0000-0000-0000-000000000004"}]')), 1,
  'a one-off goes all to the chosen bucket');
select is((select a."amountMinor" from public.allocations a join public.buckets b on b.id = a."bucketId" where a."ledgerEntryId" = 'i-one' and b.hue = 'fun'), 20000::bigint, '... Fun got all of it');
select is((select "destAccountId" from public.allocations where "ledgerEntryId" = 'i-one'), 'acc-cash', '... with its destination snapshot');

select is((select count(*)::int from confirm_incomes_with_jobs(array['i-rule'], '[{"id":"i-rule","job":null}]')), 3,
  'clearing a pick falls back to the source rule (plan)');
select is((select job from public.income_meta where "ledgerEntryId" = 'i-rule'), null, '... and the stored pick is cleared');

-- ---- a one-off with no bucket goes to the Emergency fund
select is((select count(*)::int from confirm_incomes_with_jobs(array['i-rent'], '[{"id":"i-rent","job":"one"}]')), 1, 'one-off with no bucket: one line');
select is((select b.hue from public.allocations a join public.buckets b on b.id = a."bucketId" where a."ledgerEntryId" = 'i-rent'), 'emergency', '... in the Emergency fund');

-- ---- already confirmed: left alone
select is((select count(*)::int from confirm_incomes_with_jobs(array['i-plan'], '[{"id":"i-plan","job":"one"}]')), 0, 'a confirmed income is not confirmed twice');
select is((select job from public.income_meta where "ledgerEntryId" = 'i-plan'), 'plan', '... and its stored job is not rewritten');

-- ---- signed out
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select * from confirm_incomes_with_jobs(array['i-ask'], '[]')$$, '28000', null, 'no signed-in user: refused');

select * from finish();
rollback;
