-- Plans v2 (ticket 26, P-9): named plans, which plan splits paydays, custom buckets, nudge across every plan.
begin;
select plan(165);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus") values
  ('acc-bank', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bank',  1, 0, 'PHP', 'i', 1, false, 1, 1, 2),
  ('acc-old',  'aaaaaaaa-0000-0000-0000-000000000001', 'Old',   1, 0, 'PHP', 'i', 2, true,  1, 1, 2),
  ('acc-b',    'bbbbbbbb-0000-0000-0000-000000000002', 'B Bank', 1, 0, 'PHP', 'i', 1, false, 1, 1, 2);

insert into public.buckets (id, user_id, name, "groupKey", hue, "keptInAccountId", planless, "displayOrder") values
  ('b1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Living',    'spend', 'living',    'acc-bank', false, 1),
  ('b1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emergency', 'save',  'emergency', 'acc-bank', false, 2),
  ('b1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fun',       'spend', 'fun',       'acc-bank', false, 3),
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Emergency', 'save',  'emergency', 'acc-b',    false, 1),
  ('b2000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Living',    'spend', 'living',    'acc-b',    false, 2);

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
insert into public.allocation_rules (user_id, kind, params) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'switch_on_goal',
   '{"fromPlan":"A","toPlan":"B","bucketId":"b1000000-0000-0000-0000-000000000002","targetMinor":5000000}');

insert into public.income_sources (id, user_id, name, kind, rule, "landsInAccountId") values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Salary', 'salary', 'plan', 'acc-bank');
create function pg_temp.ms(d text) returns bigint language sql as $$ select (extract(epoch from (d || ' 12:00:00+08')::timestamptz) * 1000)::bigint $$;
insert into public.ledger_entries (id, user_id, "accountId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('i-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-bank',    100000, 0, 0, pg_temp.ms('2026-10-01'), 1, 1, 2),
  ('i-2', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-bank',    100000, 0, 0, pg_temp.ms('2026-10-02'), 1, 1, 2),
  ('i-3', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-bank',  20000000, 0, 0, pg_temp.ms('2026-10-03'), 1, 1, 2),
  ('i-4', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-bank',    100000, 0, 0, pg_temp.ms('2026-10-04'), 1, 1, 2);
insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job)
select 'aaaaaaaa-0000-0000-0000-000000000001', id, 'd1000000-0000-0000-0000-000000000001', 'plan' from public.ledger_entries where id like 'i-%';

create temp table k (name text primary key, v text);
grant select, insert, update on k to authenticated;

create function pg_temp.as_a() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true) $$;
create function pg_temp.as_b() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true) $$;
create function pg_temp.key(p_name text) returns text language sql as $$ select v from k where name = p_name $$;
grant execute on function pg_temp.key(text) to authenticated;
create function pg_temp.pcts(p_key text) returns text language sql as $$
  select string_agg(b.name || '=' || l."percentBp", ',' order by b."displayOrder", b.id)
    from public.allocation_plan_lines l join public.allocation_plans p on p.id = l."planId"
    join public.buckets b on b.id = l."bucketId"
   where p.key = p_key and l."deletedAt" is null and l."percentBp" > 0 and p.user_id = auth.uid() and p."deletedAt" is null $$;
grant execute on function pg_temp.pcts(text) to authenticated;
create function pg_temp.bid(p_name text) returns uuid language sql as $$
  select id from public.buckets where name = p_name and user_id = auth.uid() and "deletedAt" is null limit 1 $$;
grant execute on function pg_temp.bid(text) to authenticated;

select ok(not has_function_privilege('anon', 'public.create_plan(text, jsonb, text)', 'execute'), 'anon cannot execute create_plan');
select ok(not has_function_privilege('anon', 'public.create_bucket(text, text, text, text)', 'execute'), 'anon cannot execute create_bucket');
select ok(not has_function_privilege('anon', 'public.set_active_plan(text, text, text, text)', 'execute'), 'anon cannot execute set_active_plan');
select ok(has_function_privilege('authenticated', 'public.plan_settings()', 'execute'), 'authenticated can execute plan_settings');

set local role authenticated;
select pg_temp.as_a();

-- ---------------------------------------------------------------- settings before anything
select is(public.plan_settings() ->> 'mode', 'auto', 'no active_plan row: automatic');
select is(public.plan_settings() ->> 'activeKey', 'A', 'Plan A is active below the target');
select is((public.plan_settings() ->> 'autoFrom') || '>' || (public.plan_settings() ->> 'autoTo'), 'A>B', 'auto from/to default to A and B');
select is((public.plan_settings() ->> 'targetMinor')::bigint, 5000000::bigint, 'the switch target is reported');
select is(public.plan_settings() ->> 'emergencyBucketId', 'b1000000-0000-0000-0000-000000000002', 'the Emergency bucket is reported');
select is(jsonb_array_length(public.plan_settings() -> 'plans'), 2, 'two plans listed');
select is(public.plan_settings() -> 'plans' -> 0, '{"key":"A","name":"Plan A","totalBp":10000,"isActive":true}'::jsonb, 'Plan A: name, total, active');

-- ---------------------------------------------------------------- create_plan
insert into k select 'scratch', public.create_plan('Lean month', '[
  {"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":7000},
  {"bucketId":"b1000000-0000-0000-0000-000000000002","percentBp":3000}]');
select matches(pg_temp.key('scratch'), '^p_[0-9a-f]{8}$', 'a new plan key is p_ + 8 hex');
select is((select name from public.allocation_plans where key = pg_temp.key('scratch') and user_id = auth.uid()), 'Lean month', 'the plan has its name');
select is(pg_temp.pcts(pg_temp.key('scratch')), 'Living=7000,Emergency=3000', 'from-scratch lines saved');
insert into k select 'copy', public.create_plan('  Copy of A  ', null, 'A');
select is(pg_temp.pcts(pg_temp.key('copy')), 'Living=5000,Emergency=3000,Fun=2000', 'a copy has the source''s lines');
select is((select name from public.allocation_plans where key = pg_temp.key('copy') and user_id = auth.uid()), 'Copy of A', 'the name is trimmed');
select is(pg_temp.pcts('A'), 'Living=5000,Emergency=3000,Fun=2000', 'the source plan is untouched');
select throws_ok($$select public.create_plan('Short', '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":9500}]')$$, '22023',
  'Short adds up to 95 percent. It must add up to 100 to be saved.', 'a plan that does not total 100 is refused');
select throws_ok($$select public.create_plan('Over', '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":10000},{"bucketId":"b1000000-0000-0000-0000-000000000002","percentBp":1}]')$$, '22023', null, 'over 100 is refused');
select throws_ok($$select public.create_plan('plan a', null, 'A')$$, 'P0001', 'You already have a plan called "plan a". Pick a different name.', 'names are unique, case-insensitive');
select throws_ok($$select public.create_plan('   ', null, 'A')$$, 'P0001', 'Give the plan a name of 1 to 40 characters.', 'an empty name is refused');
select throws_ok($$select public.create_plan(repeat('x', 41), null, 'A')$$, 'P0001', 'Give the plan a name of 1 to 40 characters.', 'a 41 character name is refused');
select throws_ok($$select public.create_plan('Nothing', null, null)$$, '22023', null, 'no lines and no plan to copy is refused');
select throws_ok($$select public.create_plan('Ghost', null, 'p_00000000')$$, '42501', null, 'copying a plan that does not exist is refused');
select throws_ok($$select public.create_plan('Dup bucket', '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":5000},{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":5000}]')$$, '22023', null, 'a bucket twice is refused');
select throws_ok($$select public.create_plan('Not mine', '[{"bucketId":"b2000000-0000-0000-0000-000000000001","percentBp":10000}]')$$, '42501', null, 'another user''s bucket is refused');

-- the 10 plan cap: A, B, Lean month, Copy of A + 6 fillers
select is((select count(*)::int from (select public.create_plan('Filler ' || g, null, 'A') from generate_series(1, 6) g) f), 6, 'six more plans fit (10 in all)');
select throws_ok($$select public.create_plan('One too many', null, 'A')$$, 'P0001', 'You can have up to 10 plans. Delete one to make room.', 'the 11th plan is refused');
select is((select count(*)::int from public.allocation_plans where user_id = auth.uid() and "deletedAt" is null), 10, 'exactly 10 live plans');

-- ---------------------------------------------------------------- rename_plan
select lives_ok(format($$select public.rename_plan(%L, 'Lean')$$, pg_temp.key('scratch')), 'rename a plan');
select is((select name from public.allocation_plans where key = pg_temp.key('scratch') and user_id = auth.uid()), 'Lean', 'the new name is stored');
select lives_ok(format($$select public.rename_plan(%L, 'LEAN')$$, pg_temp.key('scratch')), 'a plan can change the case of its own name');
select throws_ok(format($$select public.rename_plan(%L, 'copy of a')$$, pg_temp.key('scratch')), 'P0001', 'You already have a plan called "copy of a". Pick a different name.', 'rename into an existing name is refused');
select throws_ok(format($$select public.rename_plan(%L, '')$$, pg_temp.key('scratch')), 'P0001', null, 'rename to empty is refused');
select throws_ok($$select public.rename_plan('p_deadbeef', 'Whatever')$$, '42501', null, 'renaming a plan that does not exist is refused');

-- ---------------------------------------------------------------- save_plan_lines on any key
select lives_ok(format($$select public.save_plan_lines(%L, '[
  {"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":6000},
  {"bucketId":"b1000000-0000-0000-0000-000000000002","percentBp":4000}]')$$, pg_temp.key('scratch')), 'save_plan_lines works for a custom plan key');
select is(pg_temp.pcts(pg_temp.key('scratch')), 'Living=6000,Emergency=4000', 'the custom plan has its new lines');
select throws_ok(format($$select public.save_plan_lines(%L, '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":9000}]')$$, pg_temp.key('scratch')),
  '22023', 'LEAN adds up to 90 percent. It must add up to 100 to be saved.', 'a total other than 100 is still refused');
select is(pg_temp.pcts(pg_temp.key('scratch')), 'Living=6000,Emergency=4000', 'a refused save changes nothing');

-- ---------------------------------------------------------------- set_active_plan
select throws_ok($$select public.set_active_plan('sometimes')$$, '22023', null, 'unknown mode is refused');
select throws_ok($$select public.set_active_plan('manual')$$, '22023', null, 'manual needs a plan');
select throws_ok($$select public.set_active_plan('manual', 'p_deadbeef')$$, '42501', null, 'manual with an unknown plan is refused');
select throws_ok($$select public.set_active_plan('auto', 'A', 'A', 'A')$$, 'P0001', 'Pick two different plans to switch between.', 'auto from = to is refused');
select throws_ok($$select public.set_active_plan('auto', null, 'A', 'p_deadbeef')$$, '42501', null, 'auto with an unknown plan is refused');
select lives_ok(format($$select public.set_active_plan('manual', %L)$$, pg_temp.key('copy')), 'choose a plan to always use');
select is(public.active_plan(), pg_temp.key('copy'), 'manual: active_plan is that plan');
select is(public.plan_settings() ->> 'mode', 'manual', 'plan_settings says manual');
select is(public.plan_settings() ->> 'activeKey', pg_temp.key('copy'), 'plan_settings reports the active plan');
select is((select count(*)::int from jsonb_array_elements(public.plan_settings() -> 'plans') p where (p ->> 'isActive')::boolean), 1, 'exactly one plan is marked active');
select is((select params from public.allocation_rules where kind = 'active_plan' and user_id = auth.uid() and "deletedAt" is null),
  jsonb_build_object('mode', 'manual', 'planKey', pg_temp.key('copy')), 'the setting is one allocation_rules row');
select is((select params ->> 'fromPlan' from public.allocation_rules where kind = 'switch_on_goal' and user_id = auth.uid()), 'A', 'the switch rule is kept while manual');

-- ---------------------------------------------------------------- manual mode at confirm
select is((select count(*)::int from public.confirm_incomes(array['i-1'])), 3, 'a payday confirms in manual mode');
select is((select string_agg(distinct "planKey", ',') from public.allocations where "ledgerEntryId" = 'i-1'), pg_temp.key('copy'), 'the allocations record the manual plan''s key');
select is((select jsonb_object_agg(b.name, a."amountMinor") from public.allocations a join public.buckets b on b.id = a."bucketId" where a."ledgerEntryId" = 'i-1'),
  '{"Living":50000,"Emergency":30000,"Fun":20000}'::jsonb, 'and are split by that plan');

-- ---------------------------------------------------------------- delete_plan refusals
select throws_ok(format($$select public.delete_plan(%L)$$, pg_temp.key('copy')), 'P0001',
  '"Copy of A" is the plan splitting your paydays. Choose another plan under "Which plan splits your paydays" first.', 'the manual active plan can''t be deleted');
select throws_ok($$select public.delete_plan('A')$$, 'P0001',
  '"Plan A" is one of the two plans your automatic switch uses. Change the switch plans first.', 'the auto "from" plan can''t be deleted (even in manual mode)');
select throws_ok($$select public.delete_plan('B')$$, 'P0001',
  '"Plan B" is one of the two plans your automatic switch uses. Change the switch plans first.', 'the auto "to" plan can''t be deleted');
select throws_ok($$select public.delete_plan('p_deadbeef')$$, '42501', null, 'deleting a plan that does not exist is refused');
select lives_ok($$select public.delete_plan(pg_temp.key('scratch'))$$, 'an unused plan can be deleted');
select is((select count(*)::int from public.allocation_plans where key = pg_temp.key('scratch') and user_id = auth.uid() and "deletedAt" is not null), 1, 'a delete is soft: the row stays so history can name it');
select throws_ok(format($$select public.save_plan_lines(%L, '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":10000}]')$$, pg_temp.key('scratch')), 'P0002', null, 'a deleted plan can''t be saved to');
select is((select count(*)::int from public.allocation_plans where user_id = auth.uid() and "deletedAt" is null), 9, 'nine live plans left');

-- ---------------------------------------------------------------- auto mode with custom from/to
insert into k select 'second', public.create_plan('Second', '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":4000},{"bucketId":"b1000000-0000-0000-0000-000000000002","percentBp":5000},{"bucketId":"b1000000-0000-0000-0000-000000000003","percentBp":1000}]');
select lives_ok(format($$select public.set_active_plan('auto', null, %L, %L)$$, pg_temp.key('copy'), pg_temp.key('second')), 'auto with custom from and to');
select is(public.plan_settings() ->> 'mode', 'auto', 'mode is auto again');
select is((public.plan_settings() ->> 'autoFrom') || '>' || (public.plan_settings() ->> 'autoTo'), pg_temp.key('copy') || '>' || pg_temp.key('second'), 'from/to are reported');
select is(public.active_plan(), pg_temp.key('copy'), 'below the target the "from" plan is active');
select is((select params from public.allocation_rules where kind = 'switch_on_goal' and user_id = auth.uid() and "deletedAt" is null),
  jsonb_build_object('fromPlan', pg_temp.key('copy'), 'toPlan', pg_temp.key('second'), 'bucketId', 'b1000000-0000-0000-0000-000000000002', 'targetMinor', 5000000),
  'only fromPlan/toPlan changed in the switch rule');
select throws_ok(format($$select public.delete_plan(%L)$$, pg_temp.key('second')), 'P0001',
  '"Second" is one of the two plans your automatic switch uses. Change the switch plans first.', 'custom auto plans are protected too');
select lives_ok($$select public.delete_plan('B')$$, 'Plan B can go once it is no longer a switch plan');
select lives_ok(format($$select public.set_active_plan('auto', null, %L)$$, 'A'), 'changing only "from" keeps "to"');
select is(public.plan_settings() ->> 'autoTo', pg_temp.key('second'), 'the other end stayed');
select lives_ok(format($$select public.set_active_plan('auto', null, %L, null)$$, pg_temp.key('copy')), 'back to copy -> second');

-- the switch uses the configured "to" plan once Emergency reaches the target
select is((select count(*)::int from public.confirm_incomes(array['i-3'])), 3, 'a big payday confirms (Emergency is the "from" plan''s 30%)');
select is((select string_agg(distinct "planKey", ',') from public.allocations where "ledgerEntryId" = 'i-3'), pg_temp.key('copy'), 'it was split by the "from" plan');
select is(public.active_plan(), pg_temp.key('second'), 'Emergency reached the target: the custom "to" plan is active');
select is((select count(*)::int from public.confirm_incomes(array['i-4'])), 3, 'the next payday confirms');
select is((select string_agg(distinct "planKey", ',') from public.allocations where "ledgerEntryId" = 'i-4'), pg_temp.key('second'), 'and is split by the "to" plan');

-- switching mode only affects later confirms
select is((select string_agg(distinct "planKey", ',') from public.allocations where "ledgerEntryId" = 'i-1'), pg_temp.key('copy'), 'switching plans never rewrites an earlier payday (i-1)');
select lives_ok($$select public.set_active_plan('manual', 'A')$$, 'manual again, on Plan A');
select is((select string_agg(distinct "planKey", ',') from public.allocations where "ledgerEntryId" = 'i-4'), pg_temp.key('second'), 'a confirmed payday keeps its planKey after the mode changed (i-4)');
select is(public.active_plan(), 'A', 'manual ignores the switch');

-- ---------------------------------------------------------------- custom buckets
insert into k select 'trip', public.create_bucket('  Trip fund ', 'save', null, 'acc-bank')::text;
select is((select name || '|' || "groupKey" || '|' || hue || '|' || "keptInAccountId" || '|' || planless || '|' || "isArchived" from public.buckets where id = pg_temp.key('trip')::uuid),
  'Trip fund|save|c1|acc-bank|false|false', 'a custom bucket: trimmed name, group, first palette colour, home account');
select is((select "displayOrder" from public.buckets where id = pg_temp.key('trip')::uuid), 4::bigint, 'it goes to the end of the order');
select is((select count(*)::int from public.allocation_plan_lines where "bucketId" = pg_temp.key('trip')::uuid), 0, 'it starts at 0% everywhere (no line)');
insert into k select 'gift', public.create_bucket('Gifts', 'spend', 'c5')::text;
select is((select hue from public.buckets where id = pg_temp.key('gift')::uuid), 'c5', 'a chosen colour is kept');
insert into k select 'auto2', public.create_bucket('Pets', 'set_aside')::text;
select is((select hue from public.buckets where id = pg_temp.key('auto2')::uuid), 'c2', 'the next unused colour is picked');
select throws_ok($$select public.create_bucket('trip FUND', 'save')$$, 'P0001', 'You already have a bucket called "trip FUND". Pick a different name.', 'bucket names are unique, case-insensitive');
select throws_ok($$select public.create_bucket('', 'save')$$, 'P0001', 'Give the bucket a name of 1 to 40 characters.', 'empty name refused');
select throws_ok($$select public.create_bucket(repeat('y', 41), 'save')$$, 'P0001', 'Give the bucket a name of 1 to 40 characters.', '41 characters refused');
select throws_ok($$select public.create_bucket('Odd', 'weird')$$, '22023', null, 'unknown group refused');
select throws_ok($$select public.create_bucket('Odd', 'save', 'rent')$$, '22023', null, 'a built-in hue can''t be picked');
select throws_ok($$select public.create_bucket('Odd', 'save', 'c9')$$, '22023', null, 'a colour outside c1..c8 is refused');
select throws_ok($$select public.create_bucket('Odd', 'save', null, 'acc-old')$$, '42501', null, 'an archived account can''t hold it');
select throws_ok($$select public.create_bucket('Odd', 'save', null, 'acc-b')$$, '42501', null, 'another user''s account can''t hold it');

-- a custom bucket above 0% receives its share; the remainder still goes to Emergency
insert into k select 'withtrip', public.create_plan('With trip', format('[
  {"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":4000},
  {"bucketId":"b1000000-0000-0000-0000-000000000002","percentBp":3000},
  {"bucketId":"b1000000-0000-0000-0000-000000000003","percentBp":2000},
  {"bucketId":"%s","percentBp":1000}]', pg_temp.key('trip'))::jsonb);
select is((select jsonb_object_agg(b.name, s.amount) from public.split_by_plan(1001, pg_temp.key('withtrip'), '2026-10-10') s join public.buckets b on b.id = s.bucket_id),
  '{"Living":400,"Emergency":301,"Fun":200,"Trip fund":100,"Gifts":0,"Pets":0}'::jsonb, 'the custom bucket gets its 10%, the 1 centavo remainder goes to Emergency');
select is((select sum(amount)::int from public.split_by_plan(1001, pg_temp.key('withtrip'), '2026-10-10')), 1001, 'the split still sums to the amount');
select is((select count(*)::int from public.split_by_plan(1001, 'A', '2026-10-10')), 6, 'plans without the bucket still split (it gets 0)');

-- ---------------------------------------------------------------- update_bucket
select lives_ok(format($$select public.update_bucket(%L, 'Trips', 'Trips', 'set_aside', 'c7')$$, pg_temp.key('trip')), 'edit a custom bucket: name, short name, group, colour');
select is((select name || '|' || "shortName" || '|' || "groupKey" || '|' || hue from public.buckets where id = pg_temp.key('trip')::uuid), 'Trips|Trips|set_aside|c7', 'all four fields saved');
select lives_ok($$select public.update_bucket(pg_temp.bid('Fun'), 'Fun stuff', 'Fun', 'spend', 'fun')$$, 'a built-in can be renamed (same colour)');
select is((select hue from public.buckets where id = pg_temp.bid('Fun stuff')), 'fun', 'its colour is its identity and stays');
select lives_ok($$select public.update_bucket(pg_temp.bid('Fun stuff'), 'Fun stuff', 'Fun', 'spend', null)$$, 'a null colour leaves it as it is');
select throws_ok($$select public.update_bucket(pg_temp.bid('Fun stuff'), 'Fun stuff', 'Fun', 'spend', 'c3')$$, 'P0001',
  'The colour of "Fun stuff" can''t be changed: Salin uses it to recognise this bucket.', 'a built-in''s colour can''t change');
select throws_ok(format($$select public.update_bucket(%L, 'Trips', null, 'save', 'emergency')$$, pg_temp.key('trip')), '22023', null, 'a custom bucket can''t take a built-in colour');
select throws_ok(format($$select public.update_bucket(%L, 'living', null, 'save', 'c7')$$, pg_temp.key('trip')), 'P0001', 'You already have a bucket called "living". Pick a different name.', 'rename into an existing name is refused');
select throws_ok(format($$select public.update_bucket(%L, 'Trips', %L, 'save', 'c7')$$, pg_temp.key('trip'), repeat('z', 21)), 'P0001', 'The short name can be up to 20 characters.', 'a long short name is refused');
select throws_ok(format($$select public.update_bucket(%L, 'Trips', null, 'nope', 'c7')$$, pg_temp.key('trip')), '22023', null, 'unknown group is refused');
select throws_ok($$select public.update_bucket('b2000000-0000-0000-0000-000000000001', 'Mine now', null, 'save', null)$$, '42501', null, 'another user''s bucket can''t be edited');
select lives_ok($$select public.update_bucket(pg_temp.bid('Emergency'), 'Safety net', 'Safety', 'save', 'emergency')$$, 'the Emergency bucket can be renamed');
select is(public.engine_emergency_bucket(auth.uid()), 'b1000000-0000-0000-0000-000000000002'::uuid, 'the engine still finds it (by the rule and hue, not the name)');
select is((select count(*)::int from public.split_by_plan(1000, 'A', '2026-10-10')), 6, 'splitting still works after the rename');

-- ---------------------------------------------------------------- bucket_archive_reason / archive_bucket
select is(public.bucket_archive_reason(pg_temp.bid('Safety net')), 'Emergency can''t be archived: rounding and Plan B depend on it.', 'reason: Emergency');
select throws_ok($$select public.archive_bucket(pg_temp.bid('Safety net'))$$, 'P0001', 'Emergency can''t be archived: rounding and Plan B depend on it.', 'archive raises the reason');
select is(public.bucket_archive_reason(pg_temp.key('trip')::uuid), 'It still gets a share in With trip. Set it to 0% in every plan first.', 'reason: still in a plan, by name');
select lives_ok($$select public.save_plan_lines(pg_temp.key('withtrip'), '[
  {"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":5000},
  {"bucketId":"b1000000-0000-0000-0000-000000000002","percentBp":3000},
  {"bucketId":"b1000000-0000-0000-0000-000000000003","percentBp":2000}]')$$, 'take it out of the plan');
insert into public.categories (id, user_id, name, icon, color, "categoryType", "isSystem", "displayOrder", "createdAt", "updatedAt", "syncStatus") values
  ('cat-trip', 'aaaaaaaa-0000-0000-0000-000000000001', 'Flights', 'i', 'c', 1, false, 1, 1, 1, 2);
insert into public.category_buckets (user_id, "categoryId", "bucketId") values ('aaaaaaaa-0000-0000-0000-000000000001', 'cat-trip', pg_temp.key('trip')::uuid);
select is(public.bucket_archive_reason(pg_temp.key('trip')::uuid), '1 category is mapped to it. Move it to another bucket first.', 'reason: a category is mapped to it');
delete from public.category_buckets where "categoryId" = 'cat-trip';
insert into public.income_sources (id, user_id, name, kind, rule, "wholeBucketId", "landsInAccountId") values
  ('d1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Gift money', 'gift', 'whole', pg_temp.key('trip')::uuid, 'acc-bank');
select is(public.bucket_archive_reason(pg_temp.key('trip')::uuid), 'The income source "Gift money" keeps its money whole in it. Change that first.', 'reason: an income source keeps money whole in it');
update public.income_sources set rule = 'own', "wholeBucketId" = null where id = 'd1000000-0000-0000-0000-000000000002';
insert into public.income_source_split_lines (user_id, "sourceId", "bucketId", "percentBp") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', pg_temp.key('trip')::uuid, 5000);
select is(public.bucket_archive_reason(pg_temp.key('trip')::uuid), 'The income source "Gift money" splits part of its pay into it. Change that first.', 'reason: an income source''s own split uses it');
delete from public.income_source_split_lines where "sourceId" = 'd1000000-0000-0000-0000-000000000002';
-- money in it: an allocation straight into the bucket
insert into public.ledger_entries (id, user_id, "accountId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('i-5', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-bank', 12345, 0, 0, pg_temp.ms('2026-10-05'), 1, 1, 2);
insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job, "oneBucketId")
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'i-5', 'd1000000-0000-0000-0000-000000000001', 'one', pg_temp.key('trip')::uuid);
select is((select count(*)::int from public.confirm_incomes(array['i-5'])), 1, 'put money straight into the custom bucket');
select is(public.bucket_archive_reason(pg_temp.key('trip')::uuid), 'It still has ₱123.45 in it. Move it to another bucket first.', 'reason: money left in it');
select throws_ok($$select public.bucket_archive_reason('b2000000-0000-0000-0000-000000000001')$$, '42501', null, 'asking about another user''s bucket is refused');
select is(public.bucket_archive_reason(pg_temp.key('gift')::uuid), null, 'a bucket with nothing attached can be archived (null reason)');
select lives_ok(format($$select public.archive_bucket(%L)$$, pg_temp.key('gift')), 'archive it');
select is((select "isArchived" from public.buckets where id = pg_temp.key('gift')::uuid), true, 'it is archived');
select lives_ok(format($$select public.archive_bucket(%L)$$, pg_temp.key('gift')), 'archiving twice is harmless');
select is(public.bucket_archive_reason(pg_temp.key('gift')::uuid), 'It is already archived.', 'reason for an archived bucket');
select throws_ok($$select public.save_plan_lines('A', format('[{"bucketId":"%s","percentBp":10000}]', pg_temp.key('gift'))::jsonb)$$, '42501', null, 'an archived bucket can''t be put in a plan');
select is((select count(*)::int from public.split_by_plan(1000, 'A', '2026-10-10') s where s.bucket_id = pg_temp.key('gift')::uuid), 0, 'an archived bucket is out of the split');
-- restore
insert into k select 'gift2', public.create_bucket('Gifts', 'spend', 'c6')::text;
select throws_ok(format($$select public.restore_bucket(%L)$$, pg_temp.key('gift')), 'P0001', 'You already have a bucket called "Gifts". Pick a different name.', 'restore refuses a name that is taken now');
select lives_ok(format($$select public.update_bucket(%L, 'Presents', null, 'spend', null)$$, pg_temp.key('gift2')), 'rename the new one');
select lives_ok(format($$select public.restore_bucket(%L)$$, pg_temp.key('gift')), 'restore the archived bucket');
select is((select "isArchived" from public.buckets where id = pg_temp.key('gift')::uuid), false, 'it is live again');
select is((select count(*)::int from public.allocation_plan_lines l where l."bucketId" = pg_temp.key('gift')::uuid and l."deletedAt" is null and l."percentBp" > 0), 0, 'back at 0% in every plan');
select is((select count(*)::int from public.split_by_plan(1000, 'A', '2026-10-10') s where s.bucket_id = pg_temp.key('gift')::uuid), 1, 'and it is in the split again, at 0');

-- bucket cap: 20 live plan buckets (Living, Safety net, Fun stuff, Trips, Gifts, Presents, Pets = 7)
select is((select count(*)::int from (select public.create_bucket('Cap ' || g, 'spend') from generate_series(1, 13) g) c), 13, 'fill up to 20 buckets');
select throws_ok($$select public.create_bucket('Cap 14', 'spend')$$, 'P0001', 'You can have up to 20 buckets. Archive one to make room.', 'the 21st bucket is refused');

-- ---------------------------------------------------------------- nudge across every plan
select is((select string_agg(plan_key, ',' order by plan_key) from public.nudge_plan_percent(pg_temp.bid('Fun stuff'), pg_temp.bid('Living'), 100)),
  (select string_agg(key, ',' order by key) from public.allocation_plans p where p.user_id = auth.uid() and p."deletedAt" is null
     and exists (select 1 from public.allocation_plan_lines l where l."planId" = p.id and l."bucketId" = pg_temp.bid('Fun stuff') and l."deletedAt" is null and l."percentBp" >= 100)),
  'the nudge changes every live plan where Fun has at least 1%');
select is(pg_temp.pcts('A'), 'Living=5100,Safety net=3000,Fun stuff=1900', 'Plan A moved 1% from Fun to Living');
select is(pg_temp.pcts(pg_temp.key('second')), 'Living=4100,Safety net=5000,Fun stuff=900', 'a custom plan moved too');
select is((select count(*)::int from public.allocation_plans p where p.user_id = auth.uid() and p."deletedAt" is null
             and (select sum("percentBp") from public.allocation_plan_lines l where l."planId" = p.id and l."deletedAt" is null) <> 10000), 0, 'every live plan still totals 100');
select is(pg_temp.pcts(pg_temp.key('withtrip')), 'Living=5100,Safety net=3000,Fun stuff=1900', 'the plan with its own copy of the lines moved as well');
select lives_ok($$select public.save_plan_lines(pg_temp.key('second'), '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":5000},{"bucketId":"b1000000-0000-0000-0000-000000000002","percentBp":5000}]')$$, 'a plan with Fun at 0');
select is((select count(*)::int from public.nudge_plan_percent(pg_temp.bid('Fun stuff'), pg_temp.bid('Living'), 100) n where n.plan_key = pg_temp.key('second')), 0, 'a plan where Fun has 0% is left alone');
select is(pg_temp.pcts(pg_temp.key('second')), 'Living=5000,Safety net=5000', 'and unchanged');

-- ---------------------------------------------------------------- ownership (user B)
select pg_temp.as_b();
select is(public.active_plan(), 'A', 'B has its own Plan A');
select throws_ok(format($$select public.rename_plan(%L, 'Mine')$$, pg_temp.key('second')), '42501', null, 'B can''t rename A''s plan');
select throws_ok(format($$select public.delete_plan(%L)$$, pg_temp.key('second')), '42501', null, 'B can''t delete A''s plan');
select throws_ok(format($$select public.set_active_plan('manual', %L)$$, pg_temp.key('second')), '42501', null, 'B can''t activate A''s plan');
select throws_ok(format($$select public.create_plan('Stolen', null, %L)$$, pg_temp.key('second')), '42501', null, 'B can''t copy A''s plan');
select throws_ok(format($$select public.save_plan_lines(%L, '[{"bucketId":"b2000000-0000-0000-0000-000000000001","percentBp":10000}]')$$, pg_temp.key('second')), 'P0002', null, 'B can''t save lines to A''s plan');
select throws_ok(format($$select public.update_bucket(%L, 'Mine', null, 'save', null)$$, pg_temp.key('trip')), '42501', null, 'B can''t edit A''s bucket');
select throws_ok(format($$select public.archive_bucket(%L)$$, pg_temp.key('trip')), '42501', null, 'B can''t archive A''s bucket');
select throws_ok(format($$select public.restore_bucket(%L)$$, pg_temp.key('trip')), '42501', null, 'B can''t restore A''s bucket');
select throws_ok(format($$select public.nudge_plan_percent(%L, 'b2000000-0000-0000-0000-000000000002', 100)$$, pg_temp.key('trip')), '42501', null, 'B can''t nudge with A''s bucket');
select throws_ok($$select public.active_plan('aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', null, 'B can''t ask for A''s active plan');
select throws_ok($$select public.delete_plan('A')$$, 'P0001', 'You need at least one plan, so "Plan A" can''t be deleted.', 'the last plan can''t be deleted');
select is(jsonb_array_length(public.plan_settings() -> 'plans'), 1, 'B sees only its own plan');
select is((select count(*)::int from public.allocation_plans), 1, 'RLS hides A''s plans from B');
select is((select count(*)::int from public.buckets where name = 'Trips'), 0, 'RLS hides A''s custom buckets from B');

-- a user with no switch rule (Plan A only) can still choose from/to: the rule is created
insert into k select 'b2', public.create_plan('Second', '[{"bucketId":"b2000000-0000-0000-0000-000000000001","percentBp":5000},{"bucketId":"b2000000-0000-0000-0000-000000000002","percentBp":5000}]');
select is(public.plan_settings() ->> 'autoTo', null, 'no switch rule and no Plan B: autoTo is null (only live plans are reported)');
select is(public.plan_settings() -> 'plans' -> 0 ->> 'key', 'A', 'plans are listed oldest first');
select lives_ok(format($$select public.set_active_plan('auto', null, 'A', %L)$$, pg_temp.key('b2')), 'auto from/to creates the switch rule when there is none');
select is((select params ->> 'toPlan' from public.allocation_rules where kind = 'switch_on_goal' and user_id = auth.uid() and "deletedAt" is null), pg_temp.key('b2'), 'the new switch rule holds the chosen plans');
select is(public.active_plan(), 'A', 'with no target the "from" plan stays active');
select throws_ok($$select public.delete_plan('A')$$, 'P0001', '"Plan A" is one of the two plans your automatic switch uses. Change the switch plans first.', 'and it is protected');

select * from finish();
rollback;
