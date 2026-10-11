-- SQL-level golden tests for the split functions (BUSINESS_RULES 10: G1-G6, P-1) and the active-plan switch.
-- Expected numbers are copied from lib/money/*.test.ts and BUSINESS_RULES.md; they are never derived from the SQL.
begin;
select plan(29);

-- ---- fixture: the owner's sheet (BUSINESS_RULES 10), user A; user B owns an unrelated set
insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus") values
  ('acc-mari',  'aaaaaaaa-0000-0000-0000-000000000001', 'MariBank',       1, 0, 'PHP', 'i', 1, false, 1, 1, 2),
  ('acc-gcash', 'aaaaaaaa-0000-0000-0000-000000000001', 'GCash or Maya',  3, 0, 'PHP', 'i', 2, false, 1, 1, 2),
  ('acc-cash',  'aaaaaaaa-0000-0000-0000-000000000001', 'GCash / cash',   0, 0, 'PHP', 'i', 3, false, 1, 1, 2),
  ('acc-mp2',   'aaaaaaaa-0000-0000-0000-000000000001', 'Pag-IBIG MP2',   6, 0, 'PHP', 'i', 4, false, 1, 1, 2),
  ('acc-tonik', 'aaaaaaaa-0000-0000-0000-000000000001', 'Tonik',          2, 0, 'PHP', 'i', 5, false, 1, 1, 2),
  ('acc-b-1',   'bbbbbbbb-0000-0000-0000-000000000002', 'B Bank',         1, 0, 'PHP', 'i', 1, false, 1, 1, 2),
  ('acc-b-2',   'bbbbbbbb-0000-0000-0000-000000000002', 'B Wallet',       3, 0, 'PHP', 'i', 2, false, 1, 1, 2);

-- buckets in display order: tax living rent emergency invest sinking fun buffer dost
insert into public.buckets (id, user_id, name, "groupKey", hue, "keptInAccountId", planless, "displayOrder") values
  ('b1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Tax',        'set_aside', 'tax',       'acc-mari',  false, 1),
  ('b1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Living',     'spend',     'living',    'acc-cash',  false, 2),
  ('b1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rent',       'set_aside', 'rent',      'acc-mari',  false, 3),
  ('b1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emergency',  'save',      'emergency', 'acc-mari',  false, 4),
  ('b1000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Investments','save',      'invest',    'acc-mp2',   false, 5),
  ('b1000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'Sinking',    'save',      'sinking',   'acc-tonik', false, 6),
  ('b1000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fun',        'spend',     'fun',       'acc-gcash', false, 7),
  ('b1000000-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', 'Buffer',     'set_aside', 'buffer',    'acc-mari',  false, 8),
  ('b1000000-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'Scholarship','set_aside', 'dost',      'acc-mari',  true,  9),
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Emergency',  'save',      'emergency', 'acc-b-1',   false, 1),
  ('b2000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Living',     'spend',     'living',    'acc-b-2',   false, 2);

insert into public.allocation_plans (id, user_id, key, name) values
  ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'A', 'Plan A'),
  ('a1000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'B', 'Plan B'),
  ('a2000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000002', 'A', 'Plan A');
-- Plan A: tax 6 living 7 rent 2 emergency 30 invest 30 sinking 10 fun 10 buffer 5.  Plan B: emergency 10, invest 50.
insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp")
select 'aaaaaaaa-0000-0000-0000-000000000001', p.id, ('b1000000-0000-0000-0000-00000000000' || v.n)::uuid,
       case when p.key = 'A' then v.a else v.b end
  from public.allocation_plans p
  cross join (values (1, 600, 600), (2, 700, 700), (3, 200, 200), (4, 3000, 1000), (5, 3000, 5000), (6, 1000, 1000), (7, 1000, 1000), (8, 500, 500)) v(n, a, b)
 where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp") values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-000000000001', 6000),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-000000000002', 4000);

insert into public.allocation_rules (id, user_id, kind, params) values
  ('c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'switch_on_goal',
     '{"fromPlan":"A","toPlan":"B","bucketId":"b1000000-0000-0000-0000-000000000004","targetMinor":5000000}'),
  ('c1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'redirect_until_date',
     '{"fromBucketId":"b1000000-0000-0000-0000-000000000003","toBucketId":"b1000000-0000-0000-0000-000000000004","untilDate":"2027-01-01"}'),
  ('c2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'switch_on_goal',
     '{"bucketId":"b2000000-0000-0000-0000-000000000001","targetMinor":1000}');

-- sources: Others (plan job, lands MariBank), Side (own 10/40/50, lands GCash or Maya), Allowance (whole -> Living, lands cash)
insert into public.income_sources (id, user_id, name, kind, rule, "wholeBucketId", "landsInAccountId") values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Others',    'other',     'plan', null, 'acc-mari'),
  ('d1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Side',      'side_hustle','own', null, 'acc-gcash'),
  ('d1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Allowance', 'allowance', 'whole', 'b1000000-0000-0000-0000-000000000002', 'acc-cash'),
  ('d1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asker',     'gift',      'ask',  null, 'acc-mari');
insert into public.income_source_split_lines (user_id, "sourceId", "bucketId", "percentBp") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 1000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000006', 4000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000007', 5000);

-- incomes (inflow, origin manual). Dates at noon Manila.
create function pg_temp.ms(d text) returns bigint language sql as $$ select (extract(epoch from (d || ' 12:00:00+08')::timestamptz) * 1000)::bigint $$;
insert into public.ledger_entries (id, user_id, "accountId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('inc-g1',    'aaaaaaaa-0000-0000-0000-000000000001', 'acc-mari',  1732900, 0, 0, pg_temp.ms('2026-10-07'), 1, 1, 2),
  ('inc-g2',    'aaaaaaaa-0000-0000-0000-000000000001', 'acc-mari',  2300000, 0, 0, pg_temp.ms('2026-10-08'), 1, 1, 2),
  ('inc-g5',    'aaaaaaaa-0000-0000-0000-000000000001', 'acc-gcash',  350000, 0, 0, pg_temp.ms('2026-10-09'), 1, 1, 2),
  ('inc-allow', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-cash',   150000, 0, 0, pg_temp.ms('2026-10-10'), 1, 1, 2),
  ('inc-ask',   'aaaaaaaa-0000-0000-0000-000000000001', 'acc-mari',     5000, 0, 0, pg_temp.ms('2026-10-10'), 1, 1, 2),
  ('inc-b1',    'bbbbbbbb-0000-0000-0000-000000000002', 'acc-b-1',    100000, 0, 0, pg_temp.ms('2026-10-10'), 1, 1, 2);
insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-g1',    'd1000000-0000-0000-0000-000000000001', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-g2',    'd1000000-0000-0000-0000-000000000001', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-g5',    'd1000000-0000-0000-0000-000000000002', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-allow', 'd1000000-0000-0000-0000-000000000003', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-ask',   'd1000000-0000-0000-0000-000000000004', null);

-- test helpers
create function pg_temp.hue_split(p_amount bigint, p_plan text, p_date date) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(b.hue, s.amount), '{}') from public.split_by_plan(p_amount, p_plan, p_date) s join public.buckets b on b.id = s.bucket_id
$$;
create function pg_temp.as_a() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true) $$;
create function pg_temp.as_b() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true) $$;

-- an own split that adds to 90 (G6), a spending/income category set, and a waiting income for the broken split
insert into public.income_sources (id, user_id, name, kind, rule, "landsInAccountId") values
  ('d1000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Own90', 'side_hustle', 'own', 'acc-gcash');
insert into public.income_source_split_lines (user_id, "sourceId", "bucketId", "percentBp") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000001', 1000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000006', 4000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000007', 4000);
insert into public.ledger_entries (id, user_id, "accountId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('inc-own90', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-gcash', 100000, 0, 0, pg_temp.ms('2026-10-10'), 1, 1, 2);
insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-own90', 'd1000000-0000-0000-0000-000000000005', null);

insert into public.categories (id, user_id, name, icon, color, "categoryType", "isSystem", "displayOrder", "createdAt", "updatedAt", "syncStatus") values
  ('cat-living', 'aaaaaaaa-0000-0000-0000-000000000001', 'Groceries', 'i', 'c', 1, false, 1, 1, 1, 2),
  ('cat-fun',    'aaaaaaaa-0000-0000-0000-000000000001', 'Movies',    'i', 'c', 1, false, 2, 1, 1, 2),
  ('cat-misc',   'aaaaaaaa-0000-0000-0000-000000000001', 'Misc',      'i', 'c', 1, false, 3, 1, 1, 2),
  ('cat-salary', 'aaaaaaaa-0000-0000-0000-000000000001', 'Salary',    'i', 'c', 0, false, 4, 1, 1, 2);
insert into public.category_buckets (user_id, "categoryId", "bucketId", source) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cat-living', 'b1000000-0000-0000-0000-000000000002', 'auto'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cat-fun',    'b1000000-0000-0000-0000-000000000007', 'auto');

-- user C: a small bucket set for the P-1 (never below 0) cases. Order: living, emergency, invest, fun.
insert into auth.users (id, instance_id, aud, role) values
  ('cccccccc-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus") values
  ('acc-c-1', 'cccccccc-0000-0000-0000-000000000003', 'C Bank', 1, 0, 'PHP', 'i', 1, false, 1, 1, 2);
insert into public.buckets (id, user_id, name, "groupKey", hue, "keptInAccountId", "displayOrder") values
  ('b3000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'Living',    'spend', 'living',    'acc-c-1', 1),
  ('b3000000-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'Emergency', 'save',  'emergency', 'acc-c-1', 2),
  ('b3000000-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003', 'Invest',    'save',  'invest',    'acc-c-1', 3),
  ('b3000000-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000003', 'Fun',       'spend', 'fun',       'acc-c-1', 4);
insert into public.allocation_plans (id, user_id, key, name) values
  ('a3000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'P1', 'tiny emergency share'),
  ('a3000000-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'P2', 'emergency absorbs part'),
  ('a3000000-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003', 'P3', 'no emergency share'),
  ('a3000000-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000003', 'P4', 'totals 99');
insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp")
select 'cccccccc-0000-0000-0000-000000000003', ('a3000000-0000-0000-0000-00000000000' || v.p)::uuid, ('b3000000-0000-0000-0000-00000000000' || v.b)::uuid, v.bp
  from (values
    (1, 4, 3500), (1, 1, 3500), (1, 3, 2500), (1, 2, 500),
    (2, 4, 1667), (2, 1, 1667), (2, 3, 1667), (2, 2, 4999),
    (3, 1, 3333), (3, 4, 3333), (3, 3, 3334),
    (4, 1, 5000), (4, 4, 4900)) v(p, b, bp);
-- own splits for C: 50/50 on 1 centavo
insert into public.income_sources (id, user_id, name, kind, rule) values
  ('d3000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'Half', 'other', 'own');
insert into public.income_source_split_lines (user_id, "sourceId", "bucketId", "percentBp") values
  ('cccccccc-0000-0000-0000-000000000003', 'd3000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 5000),
  ('cccccccc-0000-0000-0000-000000000003', 'd3000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000004', 5000);

create function pg_temp.hue_own(p_amount bigint, p_source uuid) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(b.hue, s.amount), '{}') from public.split_own(p_amount, p_source) s join public.buckets b on b.id = s.bucket_id
$$;
create function pg_temp.as_c() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true) $$;

set local role authenticated;
select pg_temp.as_a();

-- G1 .. G4 (Plan A, before the Rent start date: Rent 0%, its 2% goes to Emergency)
select is(pg_temp.hue_split(1732900, 'A', '2026-10-07'),
  '{"tax":103974,"living":121303,"rent":0,"emergency":554528,"invest":519870,"sinking":173290,"fun":173290,"buffer":86645,"dost":0}'::jsonb, 'G1: 1732900 Plan A, Oct 7 2026');
select is((select sum(amount) from split_by_plan(1732900, 'A', '2026-10-07')), 1732900::numeric, 'G1: parts sum to the amount');
select is(pg_temp.hue_split(2300000, 'A', '2026-10-08'),
  '{"tax":138000,"living":161000,"rent":0,"emergency":736000,"invest":690000,"sinking":230000,"fun":230000,"buffer":115000,"dost":0}'::jsonb, 'G2: 2300000 Plan A, Oct 8 2026');
select is(pg_temp.hue_split(1000001, 'A', '2026-10-01'),
  '{"tax":60000,"living":70000,"rent":0,"emergency":320001,"invest":300000,"sinking":100000,"fun":100000,"buffer":50000,"dost":0}'::jsonb, 'G3: 1000001 gives the +1 remainder to Emergency');
select is(pg_temp.hue_split(333, 'A', '2026-10-01'),
  '{"tax":20,"living":23,"rent":0,"emergency":107,"invest":100,"sinking":33,"fun":33,"buffer":17,"dost":0}'::jsonb, 'G4: 333 centavos');
select is((select sum(amount) from split_by_plan(333, 'A', '2026-10-01')), 333::numeric, 'G4: parts sum to 333');

-- output shape: one line per bucket in bucket order, percent_bp after the redirect
select is(array(select percent_bp from split_by_plan(1000, 'A', '2026-10-01')), array[600, 700, 0, 3200, 3000, 1000, 1000, 500, 0],
  'percent_bp shows the percentages actually used (Rent 0, Emergency 32%) in bucket order');
select is(array(select percent_bp from split_by_plan(1000, 'A', '2027-01-01')), array[600, 700, 200, 3000, 3000, 1000, 1000, 500, 0],
  'percent_bp on the start date: Rent has its own 2%');

-- rent redirect by the income date (D-17), not today
select is(pg_temp.hue_split(1732900, 'A', '2026-12-31') ->> 'rent', '0', 'redirect applies the day before the start date');
select is(pg_temp.hue_split(1732900, 'A', '2027-01-01') ->> 'rent', '34658', 'rent gets 2% on the start date');
select is(pg_temp.hue_split(1732900, 'A', '2027-01-01') ->> 'emergency', '519870', 'Emergency keeps only its own 30% from the start date');
select is(pg_temp.hue_split(1732900, 'B', '2026-10-07'),
  '{"tax":103974,"living":121303,"rent":0,"emergency":207948,"invest":866450,"sinking":173290,"fun":173290,"buffer":86645,"dost":0}'::jsonb, 'Plan B: Emergency 10%+2% redirect, Investments 50%');
select is((select sum(amount) from split_by_plan(0, 'A', '2026-10-01')), 0::numeric, 'amount 0 splits to zeros');

-- own split: G5, G6
select is(pg_temp.hue_own(350000, 'd1000000-0000-0000-0000-000000000002'), '{"tax":35000,"sinking":140000,"fun":175000}'::jsonb, 'G5: 350000 own split 10/40/50');
select is(array(select bucket_id::text from split_own(350000, 'd1000000-0000-0000-0000-000000000002')),
  array['b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000007'], 'own split lines come in bucket order');
select throws_like($$select * from split_own(350000, 'd1000000-0000-0000-0000-000000000005')$$, '%adds to 90.00 percent%', 'G6: own split of 90 is refused with its reason');
select throws_ok($$select * from split_own(100, 'd1000000-0000-0000-0000-0000000000ff')$$, 'P0001', null, 'unknown source is refused');

-- plan errors
select throws_like($$select * from split_by_plan(100, 'Z', '2026-10-01')$$, '%plan Z not found%', 'unknown plan key is refused');
select throws_ok($$select * from split_by_plan(-1, 'A', '2026-10-01')$$, 'P0001', 'amount must be >= 0', 'negative amount is refused');

-- P-1: never below 0 (user C)
select pg_temp.as_c();
select is(pg_temp.hue_split(2, 'P1', '2026-10-01'), '{"living":0,"emergency":0,"invest":1,"fun":1}'::jsonb,
  'P-1: 2 centavos, 35/35/25/5: the -1 comes from the largest share, not from a 0 Emergency (mirrors the TS test)');
select ok((select bool_and(amount >= 0) and sum(amount) = 3 from split_by_plan(3, 'P2', '2026-10-01')), 'P-1: 3 centavos, Emergency absorbs part: no negative line, sum exact');
select is(pg_temp.hue_split(100, 'P3', '2026-10-01'), '{"living":33,"emergency":0,"invest":34,"fun":33}'::jsonb,
  'Emergency at 0%: the remainder goes to the largest share');
select ok((select bool_and(amount >= 0) and sum(amount) = 1 from split_by_plan(1, 'P1', '2026-10-01')), 'P-1: 1 centavo');
select is(pg_temp.hue_own(1, 'd3000000-0000-0000-0000-000000000001'), '{"living":0,"fun":1}'::jsonb, 'P-1 own split: 1 centavo 50/50 gives the centavo to the second bucket');
select throws_like($$select * from split_by_plan(100, 'P4', '2026-10-01')$$, '%must total 10000%', 'a plan that does not total 100% is refused');

-- sweep: every amount 0..300 over every plan: exact sum and no negative line (SQL invariant)
select pg_temp.as_a();
select ok((select bool_and(ok) from (
  select (select sum(amount) = a and bool_and(amount >= 0) from split_by_plan(a, p, d)) as ok
    from generate_series(0, 300) a, (values ('A'), ('B')) pl(p), (values ('2026-10-01'::date), ('2027-03-01'::date)) dd(d)) q),
  'sweep 0..300 centavos, plans A and B, both sides of the rent date: exact sum, no negative line');

-- the Emergency bucket and plan switch measure
select is(active_plan(), 'A', 'active_plan is A with no Emergency allocations');
select is(engine_emergency_bucket('aaaaaaaa-0000-0000-0000-000000000001'), 'b1000000-0000-0000-0000-000000000004'::uuid, 'Emergency bucket comes from the switch_on_goal rule');
select is(engine_rent_bucket('aaaaaaaa-0000-0000-0000-000000000001'), 'b1000000-0000-0000-0000-000000000003'::uuid, 'Rent bucket comes from the redirect rule');

select * from finish();
rollback;
