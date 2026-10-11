-- Triggers on the mobile-synced ledger_entries (DATA_MODEL 4.2, 4.3, P-5):
-- spending gets its bucket from the category; inflows are recognised as income; and a trigger error never
-- fails the mobile insert (the bodies catch everything and only warn).
begin;
select plan(50);

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
create function pg_temp.plan_rows() returns text[] language sql as $$
  select coalesce(array_agg(kind || ' ' || from_account_id || '>' || to_account_id || ' ' || amount || ' net ' || netted || ' sent ' || sent order by ord), '{}')
    from (select t.*, row_number() over () as ord from public.transfer_plan() t) t
$$;

-- a sources/categories set for recognition: Salary category -> the "Work" source
insert into public.income_sources (id, user_id, name, kind, rule, "categoryId", "landsInAccountId") values
  ('d1000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Work', 'salary', 'plan', 'cat-salary', 'acc-mari');
delete from public.income_meta;   -- start the recognition tests with no meta rows and no Others source
delete from public.income_sources where id = 'd1000000-0000-0000-0000-000000000001';

-- the phone pushes rows as user A (upsert of Drift's toJson, camelCase)
set local role authenticated;
select pg_temp.as_a();
create function pg_temp.mobile_push(p_id text, p_cat text, p_amount bigint, p_dir bigint, p_origin bigint, p_deleted bigint default null) returns void language sql as $$
  insert into public.ledger_entries (id, user_id, "accountId", "categoryId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "deletedAt", "syncStatus")
  values (p_id, auth.uid(), 'acc-cash', p_cat, p_amount, p_dir, p_origin, 1000, 1, 1, p_deleted, 2)
  on conflict (id) do update set "categoryId" = excluded."categoryId", "amountMinor" = excluded."amountMinor", "deletedAt" = excluded."deletedAt", "updatedAt" = excluded."updatedAt"
$$;

-- ---- entry_buckets (spending -> bucket at log time)
select lives_ok($$select pg_temp.mobile_push('m-sp1', 'cat-living', 5000, 1, 0)$$, 'phone pushes a Groceries expense');
select is((select "bucketId"::text || '|' || source from public.entry_buckets where "ledgerEntryId" = 'm-sp1'), 'b1000000-0000-0000-0000-000000000002|category', 'it is assigned the bucket its category maps to, source category');
select lives_ok($$select pg_temp.mobile_push('m-sp1', 'cat-living', 6000, 1, 0)$$, 'the phone pushes the same entry again (upsert)');
select is((select count(*)::int from public.entry_buckets where "ledgerEntryId" = 'm-sp1'), 1, 'still one entry_buckets row');
select lives_ok($$select pg_temp.mobile_push('m-sp2', 'cat-misc', 100, 1, 0)$$, 'an expense in an unmapped category');
select is((select count(*)::int from public.entry_buckets where "ledgerEntryId" = 'm-sp2'), 0, 'no bucket row: it is not mapped yet');
select lives_ok($$select pg_temp.mobile_push('m-sp3', null, 100, 1, 0)$$, 'an expense with no category');
select is((select count(*)::int from public.entry_buckets where "ledgerEntryId" = 'm-sp3'), 0, 'no bucket row');
select lives_ok($$select pg_temp.mobile_push('m-tr1', 'cat-living', 100, 1, 3)$$, 'a transfer-origin leg with a category');
select is((select count(*)::int from public.entry_buckets where "ledgerEntryId" = 'm-tr1'), 0, 'transfer legs are never spending');
select lives_ok($$select pg_temp.mobile_push('m-in1', 'cat-living', 100, 0, 0)$$, 'an inflow in a mapped category');
select is((select count(*)::int from public.entry_buckets where "ledgerEntryId" = 'm-in1'), 0, 'inflows are not spending');

-- category change on the phone: moves the entry unless it was overridden
select lives_ok($$select pg_temp.mobile_push('m-sp1', 'cat-fun', 6000, 1, 0)$$, 'the phone recategorises the expense to Movies');
select is((select "bucketId"::text from public.entry_buckets where "ledgerEntryId" = 'm-sp1'), 'b1000000-0000-0000-0000-000000000007', 'the entry follows its new category');
reset role;
update public.entry_buckets set source = 'override', "bucketId" = 'b1000000-0000-0000-0000-000000000008' where "ledgerEntryId" = 'm-sp1';
set local role authenticated;
select pg_temp.as_a();
select lives_ok($$select pg_temp.mobile_push('m-sp1', 'cat-living', 6000, 1, 0)$$, 'the phone recategorises again');
select is((select "bucketId"::text || '|' || source from public.entry_buckets where "ledgerEntryId" = 'm-sp1'), 'b1000000-0000-0000-0000-000000000008|override', 'an override is never moved');

-- category moves never touch old entries (BR 6.2)
reset role;
update public.category_buckets set "bucketId" = 'b1000000-0000-0000-0000-000000000008' where "categoryId" = 'cat-fun';
set local role authenticated;
select pg_temp.as_a();
select lives_ok($$select pg_temp.mobile_push('m-sp4', 'cat-fun', 100, 1, 0)$$, 'a new Movies expense after the category moved to Buffer');
select is((select "bucketId"::text from public.entry_buckets where "ledgerEntryId" = 'm-sp4'), 'b1000000-0000-0000-0000-000000000008', 'new spending goes to the new bucket');
select is((select count(*)::int from public.entry_buckets where "bucketId" = 'b1000000-0000-0000-0000-000000000007'), 0, 'nothing else changed');

-- ---- income recognition (DATA_MODEL 4.3)
select lives_ok($$select pg_temp.mobile_push('m-inc1', 'cat-salary', 2000000, 0, 0)$$, 'phone pushes a Salary inflow');
select is((select "sourceId"::text || '|' || coalesce(job, 'null') from public.income_meta where "ledgerEntryId" = 'm-inc1'), 'd1000000-0000-0000-0000-0000000000a1|null', 'recognised as the Work source, no job yet (Money in)');
select lives_ok($$select pg_temp.mobile_push('m-inc1', 'cat-salary', 2100000, 0, 0)$$, 'the same inflow is pushed again');
select is((select count(*)::int from public.income_meta where "ledgerEntryId" = 'm-inc1'), 1, 'no duplicate income_meta');
select lives_ok($$select pg_temp.mobile_push('m-inc2', null, 5000, 0, 0)$$, 'an uncategorised inflow before the user has onboarded');
select is((select count(*)::int from public.income_meta where "ledgerEntryId" = 'm-inc2'), 0, 'not recognised before onboarding (no Others source is invented)');
reset role;
insert into public.user_profiles (user_id, "firstName", "onboardedAt") values ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana', 1);
set local role authenticated;
select pg_temp.as_a();
select lives_ok($$select pg_temp.mobile_push('m-inc3', null, 5000, 0, 0)$$, 'an uncategorised inflow after onboarding');
select is((select s.name from public.income_meta m join public.income_sources s on s.id = m."sourceId" where m."ledgerEntryId" = 'm-inc3'), 'Others', 'it goes to the Others source');
select lives_ok($$select pg_temp.mobile_push('m-inc4', 'cat-misc', 7000, 0, 0)$$, 'an inflow in a category no source claims');
select is((select s.name from public.income_meta m join public.income_sources s on s.id = m."sourceId" where m."ledgerEntryId" = 'm-inc4'), 'Others', 'it goes to the Others source too');
select is((select count(*)::int from public.income_sources where name = 'Others' and "deletedAt" is null and user_id = auth.uid() and kind = 'other'), 1, 'one Others source was created and then reused');
select lives_ok($$select pg_temp.mobile_push('m-tr2', 'cat-salary', 100, 0, 3)$$, 'a transfer-origin inflow');
select is((select count(*)::int from public.income_meta where "ledgerEntryId" = 'm-tr2'), 0, 'transfer legs are not income');
select lives_ok($$select pg_temp.mobile_push('m-inc5', 'cat-salary', 100, 0, 0, 99)$$, 'an inflow that arrives already deleted');
select is((select count(*)::int from public.income_meta where "ledgerEntryId" = 'm-inc5'), 0, 'deleted inflows are not recognised');

-- the web's own transfer legs (origin 3) do not trigger anything
reset role;
insert into public.income_meta (user_id, "ledgerEntryId", job) values ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-g2', 'plan');
set local role authenticated;
select pg_temp.as_a();
create temp table _cnt as select (select count(*) from public.entry_buckets) as e, (select count(*) from public.income_meta) as i;
grant all on _cnt to authenticated;
select is((select count(*)::int from confirm_incomes(array['inc-g2'])), 7, 'web: confirm G2');
select lives_ok($$select tick_transfer('acc-mari', 'acc-mp2', 690000)$$, 'web: tick a transfer (writes two origin-3 legs)');
select is((select count(*) from public.entry_buckets), (select e from _cnt), 'the legs created no entry_buckets row');
select is((select count(*) from public.income_meta), (select i from _cnt), 'the legs created no income_meta row');

-- ---- P-5: a trigger error never blocks the mobile insert
reset role;
alter table public.entry_buckets add constraint z_always_fails check (false) not valid;
alter table public.income_meta add constraint z_always_fails check (false) not valid;
set local role authenticated;
select pg_temp.as_a();
select lives_ok($$select pg_temp.mobile_push('m-f1', 'cat-living', 100, 1, 0)$$, 'P-5: expense insert succeeds although the entry_buckets insert fails inside the trigger');
select is((select amount::int from (select "amountMinor" as amount from public.ledger_entries where id = 'm-f1') x), 100, 'P-5: the ledger entry was written');
select is((select count(*)::int from public.entry_buckets where "ledgerEntryId" = 'm-f1'), 0, 'P-5: and no entry_buckets row (the trigger failed softly)');
select lives_ok($$select pg_temp.mobile_push('m-sp4', 'cat-living', 100, 1, 0)$$, 'P-5: a recategorising update succeeds although the bucket update fails');
select is((select "categoryId" from public.ledger_entries where id = 'm-sp4'), 'cat-living', 'P-5: the entry really changed category');
select lives_ok($$select pg_temp.mobile_push('m-f2', 'cat-salary', 100, 0, 0)$$, 'P-5: inflow insert succeeds although income recognition fails');
select is((select count(*)::int from public.ledger_entries where id = 'm-f2'), 1, 'P-5: the inflow was written');
select is((select count(*)::int from public.income_meta where "ledgerEntryId" = 'm-f2'), 0, 'P-5: without a meta row');
-- a hard failure the handler cannot hide would still fail; check the handler by name instead
select is((select count(*)::int from pg_proc where proname in ('trg_entry_bucket_upsert', 'trg_income_recognition') and prosrc ilike '%exception when others then%raise warning%'), 2, 'P-5: both trigger bodies catch everything and only warn');
reset role;
alter table public.entry_buckets drop constraint z_always_fails;
alter table public.income_meta drop constraint z_always_fails;
set local role authenticated;
select pg_temp.as_a();

-- ---- backfill (run once at first plan setup): maps existing spending by the CURRENT category map
reset role;
delete from public.entry_buckets;
set local role authenticated;
select pg_temp.as_a();
select is(backfill_entry_buckets(), 3, 'backfill maps the three mapped spending entries (not unmapped, not transfer legs, not inflows)');
select is(backfill_entry_buckets(), 0, 'backfill is idempotent');
select is((select count(*)::int from public.entry_buckets where source = 'category'), 3, 'backfilled rows have source category');

select * from finish();
rollback;
