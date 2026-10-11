-- Plans -> Split plan + Rules (ticket 8): save_plan_lines, set_bucket_kept_in, set_plan_switch_target.
-- Happy paths, refused input, cross-user, and "edits never change confirmed allocations".
begin;
select plan(41);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus") values
  ('acc-mari',  'aaaaaaaa-0000-0000-0000-000000000001', 'MariBank', 1, 0, 'PHP', 'i', 1, false, 1, 1, 2),
  ('acc-gcash', 'aaaaaaaa-0000-0000-0000-000000000001', 'GCash',    3, 0, 'PHP', 'i', 2, false, 1, 1, 2),
  ('acc-old',   'aaaaaaaa-0000-0000-0000-000000000001', 'Old',      0, 0, 'PHP', 'i', 3, true,  1, 1, 2),
  ('acc-b-1',   'bbbbbbbb-0000-0000-0000-000000000002', 'B Bank',   1, 0, 'PHP', 'i', 1, false, 1, 1, 2);

insert into public.buckets (id, user_id, name, "groupKey", hue, "keptInAccountId", planless, "displayOrder") values
  ('b1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Living',      'spend',     'living',    'acc-mari', false, 1),
  ('b1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emergency',   'save',      'emergency', 'acc-mari', false, 2),
  ('b1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fun',         'spend',     'fun',       'acc-mari', false, 3),
  ('b1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Scholarship', 'set_aside', 'dost',      'acc-mari', true,  4),
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Emergency',   'save',      'emergency', 'acc-b-1',  false, 1),
  ('b2000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Living',      'spend',     'living',    'acc-b-1',  false, 2);

insert into public.allocation_plans (id, user_id, key, name) values
  ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'A', 'Plan A'),
  ('a1000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'B', 'Plan B'),
  ('a2000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000002', 'A', 'Plan A');
insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000001', 5000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000002', 3000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000003', 2000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000001', 6000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000002', 4000),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-000000000001', 6000),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-000000000002', 4000);

-- A has a switch rule and the Emergency goal flagged as the plan switch; B has neither.
insert into public.allocation_rules (user_id, kind, params) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'switch_on_goal',
   '{"fromPlan":"A","toPlan":"B","bucketId":"b1000000-0000-0000-0000-000000000002","targetMinor":5000000}');
insert into public.goals (id, user_id, name, "targetMinor", "linkedBucketId", "isPlanSwitch") values
  ('90000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emergency fund', 5000000, 'b1000000-0000-0000-0000-000000000002', true),
  ('90000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Trip', 1000000, null, false);

-- A confirmed payday (an immutable snapshot) that none of the edits below may touch.
insert into public.transfer_cycles (id, user_id) values ('44444444-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into public.allocations (user_id, "bucketId", "amountMinor", "destAccountId", "planKey", "percentBp", "transferCycleId") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 50000, 'acc-mari', 'A', 5000, '44444444-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 30000, 'acc-mari', 'A', 3000, '44444444-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 20000, 'acc-mari', 'A', 2000, '44444444-0000-0000-0000-000000000001');
create temp table snap as select md5(string_agg(a::text, '|' order by a.id)) as h from public.allocations a;
grant select on snap to authenticated;

create function pg_temp.as_a() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true) $$;
create function pg_temp.as_b() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true) $$;
create function pg_temp.pcts(p_key text) returns text language sql as $$
  select string_agg(b.hue || '=' || l."percentBp", ',' order by b."displayOrder")
    from public.allocation_plan_lines l join public.allocation_plans p on p.id = l."planId"
    join public.buckets b on b.id = l."bucketId"
   where p.key = p_key and l."deletedAt" is null and p.user_id = auth.uid() $$;
grant execute on function pg_temp.pcts(text) to authenticated;

select has_function('public', 'save_plan_lines', array['text', 'jsonb'], 'save_plan_lines exists');
select ok(not has_function_privilege('anon', 'public.save_plan_lines(text, jsonb)', 'execute'), 'anon cannot execute save_plan_lines');
select ok(not has_function_privilege('anon', 'public.set_bucket_kept_in(uuid, text)', 'execute'), 'anon cannot execute set_bucket_kept_in');
select ok(not has_function_privilege('anon', 'public.set_plan_switch_target(bigint)', 'execute'), 'anon cannot execute set_plan_switch_target');

set local role authenticated;
select pg_temp.as_a();

-- ---------------------------------------------------------------- save_plan_lines
select lives_ok($$select public.save_plan_lines('A', '[
  {"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":4000},
  {"bucketId":"b1000000-0000-0000-0000-000000000002","percentBp":4000},
  {"bucketId":"b1000000-0000-0000-0000-000000000003","percentBp":2000}]')$$, 'a plan that totals 100 saves');
select is(pg_temp.pcts('A'), 'living=4000,emergency=4000,fun=2000', 'Plan A has the new percentages');
select is(pg_temp.pcts('B'), 'living=6000,emergency=4000', 'Plan B is untouched');
select is((select count(*)::int from public.allocation_plan_lines l join public.allocation_plans p on p.id = l."planId" where p.key = 'A' and l."deletedAt" is null), 3, 'no duplicate lines after an update');

select throws_ok($$select public.save_plan_lines('A', '[
  {"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":4500},
  {"bucketId":"b1000000-0000-0000-0000-000000000002","percentBp":4000},
  {"bucketId":"b1000000-0000-0000-0000-000000000003","percentBp":1000}]')$$, '22023', 'Plan A adds up to 95 percent. It must add up to 100 to be saved.', '95% is refused with the exact reason');
select is(pg_temp.pcts('A'), 'living=4000,emergency=4000,fun=2000', 'the last valid Plan A stays active after a refused save');
select throws_ok($$select public.save_plan_lines('A', '[
  {"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":6000},
  {"bucketId":"b1000000-0000-0000-0000-000000000002","percentBp":4000},
  {"bucketId":"b1000000-0000-0000-0000-000000000003","percentBp":1000}]')$$, '22023', null, '110% is refused');
select throws_ok($$select public.save_plan_lines('A', '[
  {"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":5000},
  {"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":5000}]')$$, '22023', null, 'the same bucket twice is refused');
select throws_ok($$select public.save_plan_lines('A', '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":-100},{"bucketId":"b1000000-0000-0000-0000-000000000002","percentBp":10100}]')$$,
  '22023', null, 'a negative percent is refused');
select throws_ok($$select public.save_plan_lines('A', '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":33.5},{"bucketId":"b1000000-0000-0000-0000-000000000002","percentBp":9966.5}]')$$,
  '22023', null, 'a fractional basis-point value is refused');
select throws_ok($$select public.save_plan_lines('A', '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":6000},{"bucketId":"b1000000-0000-0000-0000-000000000004","percentBp":4000}]')$$,
  '42501', null, 'a planless bucket cannot be in a plan');
select throws_ok($$select public.save_plan_lines('A', '[{"bucketId":"b2000000-0000-0000-0000-000000000001","percentBp":10000}]')$$,
  '42501', null, 'another user''s bucket is refused');
select throws_ok($$select public.save_plan_lines('A', '[{"bucketId":"not-a-uuid","percentBp":10000}]')$$, '22023', null, 'a malformed bucket id is refused');
select throws_ok($$select public.save_plan_lines('A', '{"x":1}')$$, '22023', null, 'a non-array payload is refused');
select throws_ok($$select public.save_plan_lines('Z', '[]')$$, 'P0002', null, 'an unknown plan is refused');

-- omitted buckets are dropped by soft delete
select lives_ok($$select public.save_plan_lines('B', '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":10000}]')$$, 'Plan B can be one bucket at 100');
select is(pg_temp.pcts('B'), 'living=10000', 'Plan B now has one live line');
select is((select count(*)::int from public.allocation_plan_lines l join public.allocation_plans p on p.id = l."planId" where p.key = 'B' and l."deletedAt" is not null), 1, 'the dropped line is soft-deleted, not removed');

-- ---------------------------------------------------------------- cross-user
select pg_temp.as_b();
select throws_ok($$select public.save_plan_lines('A', '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":10000}]')$$, '42501', null, 'B cannot put A''s bucket in B''s plan');
select lives_ok($$select public.save_plan_lines('A', '[{"bucketId":"b2000000-0000-0000-0000-000000000001","percentBp":7000},{"bucketId":"b2000000-0000-0000-0000-000000000002","percentBp":3000}]')$$, 'B saves B''s own Plan A');
select is(pg_temp.pcts('A'), 'emergency=7000,living=3000', 'B sees B''s plan');
select throws_ok($$select public.set_bucket_kept_in('b1000000-0000-0000-0000-000000000001', 'acc-b-1')$$, '42501', null, 'B cannot move A''s bucket');
select throws_ok($$select public.set_bucket_kept_in('b2000000-0000-0000-0000-000000000001', 'acc-mari')$$, '42501', null, 'B cannot keep a bucket in A''s account');
select throws_ok($$select public.set_plan_switch_target(100000)$$, 'P0002', null, 'B has no switch rule to change');
select pg_temp.as_a();
select is(pg_temp.pcts('A'), 'living=4000,emergency=4000,fun=2000', 'A''s Plan A was not touched by B');

-- ---------------------------------------------------------------- set_bucket_kept_in
select lives_ok($$select public.set_bucket_kept_in('b1000000-0000-0000-0000-000000000003', 'acc-gcash')$$, 'a bucket can be kept in another of my accounts');
select is((select "keptInAccountId" from public.buckets where id = 'b1000000-0000-0000-0000-000000000003'), 'acc-gcash', 'the bucket is now kept in GCash');
select throws_ok($$select public.set_bucket_kept_in('b1000000-0000-0000-0000-000000000003', 'acc-old')$$, '42501', null, 'an archived account is refused');
select throws_ok($$select public.set_bucket_kept_in('b1000000-0000-0000-0000-000000000003', 'acc-b-1')$$, '42501', null, 'another user''s account is refused');
select lives_ok($$select public.set_bucket_kept_in('b1000000-0000-0000-0000-000000000004', 'acc-gcash')$$, 'a planless bucket has a Kept in too');

-- ---------------------------------------------------------------- set_plan_switch_target
select lives_ok($$select public.set_plan_switch_target(7500000)$$, 'the Plan B switch amount can change');
select is((select (params ->> 'targetMinor')::bigint from public.allocation_rules where kind = 'switch_on_goal'), 7500000::bigint, 'the rule has the new target');
select is((select "targetMinor" from public.goals where id = '90000000-0000-0000-0000-000000000001'), 7500000::bigint, 'the Emergency goal moved with it (one value)');
select is((select "targetMinor" from public.goals where id = '90000000-0000-0000-0000-000000000002'), 1000000::bigint, 'other goals are untouched');
select throws_ok($$select public.set_plan_switch_target(0)$$, '22023', null, 'zero is refused');
select throws_ok($$select public.set_plan_switch_target(1000000001)$$, '22023', null, 'above PHP 10,000,000 is refused');

-- ---------------------------------------------------------------- history
reset role;
select is((select md5(string_agg(a::text, '|' order by a.id)) from public.allocations a), (select h from snap), 'no confirmed allocation changed (amounts, plan key, percentages, destination snapshots)');

select * from finish();
rollback;
