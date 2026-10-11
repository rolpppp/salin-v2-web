-- Cross-user: user B cannot read or write A's engine data, through RLS and through the ownership checks
-- inside every function (cross-user ids are not FK-guarded: a foreign id could otherwise be stored).
begin;
select plan(45);

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

-- B has a small setup of their own: a source that uses the plan, one waiting income
insert into public.income_sources (id, user_id, name, kind, rule, "landsInAccountId") values
  ('d2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'B work', 'salary', 'plan', 'acc-b-1');
insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'inc-b1', 'd2000000-0000-0000-0000-000000000001', null);

create function pg_temp.affected(q text) returns int language plpgsql as $$ declare n int; begin execute q; get diagnostics n = row_count; return n; end $$;
set local role authenticated;
select pg_temp.as_a();
select is((select count(*)::int from confirm_incomes(array['inc-g2', 'inc-g5', 'inc-allow'])), 11, 'A confirms three incomes');
select lives_ok($$select tick_transfer('acc-mari', 'acc-mp2', 690000)$$, 'A ticks MariBank -> MP2');
create temp table _a_before as select (select count(*) from public.allocations) as al, (select count(*) from public.transfers) as tr,
  (select count(*) from public.ledger_entries) as le, (select count(*) from public.transfer_checks) as tc, (select count(*) from public.transfer_cycles) as cy;
grant all on _a_before to authenticated;

-- ---- B through RLS
select pg_temp.as_b();
select is((select count(*)::int from public.allocations), 0, 'B sees none of A''s allocations');
select is((select count(*)::int from public.transfer_cycles), 0, 'B sees none of A''s transfer cycles');
select is((select count(*)::int from public.transfer_checks), 0, 'B sees none of A''s transfer checks');
select is((select count(*)::int from public.transfers), 0, 'B sees none of A''s transfers');
select is((select count(*)::int from public.ledger_entries where id like '%mp2%' or "transferId" is not null), 0, 'B sees none of A''s transfer legs');
reset role;
create temp table _a_ids as select (select id from public.transfer_cycles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') as cycle, (select id from public.transfer_checks where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') as chk;
grant all on _a_ids to authenticated;
set local role authenticated;
select pg_temp.as_b();
select throws_ok($$insert into public.allocations (user_id, "bucketId", "amountMinor", "transferCycleId") values ('aaaaaaaa-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 1, (select cycle from _a_ids))$$, '42501', null, 'B cannot write an allocation for A');
select throws_ok($$insert into public.transfer_cycles (user_id) values ('aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', null, 'B cannot open a cycle for A');
select throws_ok($$insert into public.transfer_checks (user_id, "fromAccountId", "toAccountId", "sentMinor", "periodKey") values ('aaaaaaaa-0000-0000-0000-000000000001', 'acc-mari', 'acc-tonik', 1, 'x')$$, '42501', null, 'B cannot write a transfer check for A');
select is(pg_temp.affected($q$update public.transfer_cycles set "closedAt" = 1 where id = (select cycle from _a_ids)$q$), 0, 'B cannot update A''s cycle');
select is(pg_temp.affected($q$update public.transfer_checks set "sentMinor" = 1 where id = (select chk from _a_ids)$q$), 0, 'B cannot update A''s check');
select is(pg_temp.affected($q$delete from public.transfer_checks where id = (select chk from _a_ids)$q$), 0, 'B cannot delete A''s check');
select is(pg_temp.affected($q$update public.transfers set "deletedAt" = 1$q$), 0, 'B cannot soft-delete A''s transfers');
select is(pg_temp.affected($q$update public.ledger_entries set "deletedAt" = 1 where "transferId" is not null$q$), 0, 'B cannot soft-delete A''s legs');

-- ---- B through the functions, with A's ids
select throws_ok($$select * from confirm_incomes(array['inc-g1'])$$, 'P0002', null, 'confirm_incomes: A''s income id');
select throws_ok($$select * from confirm_incomes(array['inc-b1', 'inc-g1'])$$, 'P0002', null, 'confirm_incomes: own plus A''s id refuses the whole call');
select is((select count(*)::int from public.allocations), 0, '... and wrote nothing');
select is((select count(*)::int from confirm_incomes(array['inc-b1'])), 2, 'B confirms their own income (positive control)');
select is((select count(*)::int from public.transfer_cycles), 1, 'B has their own cycle');
select throws_like($$select tick_transfer('acc-mari', 'acc-mp2', 100)$$, '%account not found%', 'tick_transfer: A''s accounts');
select throws_like($$select tick_transfer('acc-b-1', 'acc-mari', 100)$$, '%account not found%', 'tick_transfer: one of A''s accounts');
select throws_like($$select untick_transfer('acc-mari', 'acc-mp2')$$, '%nothing ticked%', 'untick_transfer: A''s pair is not B''s to untick');
select lives_ok($$select tick_transfer('acc-b-1', 'acc-b-2', 40000)$$, 'B ticks their own transfer (positive control)');
select throws_ok($$select cover_bucket('b1000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000002', 1)$$, 'P0002', null, 'cover_bucket: A''s buckets');
select throws_ok($$select cover_bucket('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 1)$$, 'P0002', null, 'cover_bucket: one of A''s buckets');
select throws_like($$select * from split_own(100, 'd1000000-0000-0000-0000-000000000002')$$, '%not found%', 'split_own: A''s source');
select throws_like($$select * from engine_split_plan('aaaaaaaa-0000-0000-0000-000000000001', 100, 'A', '2026-10-01')$$, '%not found%', 'engine_split_plan for A''s user id: RLS hides A''s plan');
select is(pg_temp.hue_split(1000, 'A', '2026-10-01'), '{"emergency":600,"living":400}'::jsonb, 'split_by_plan only ever uses B''s own plan and buckets');
select throws_ok($$select active_plan('aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', null, 'active_plan(A) refused');
select throws_ok($$select * from transfer_plan('aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', null, 'transfer_plan(A) refused');
select throws_ok($$select * from bucket_left('aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', null, 'bucket_left(A) refused');
select throws_ok($$select * from account_should_hold('aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', null, 'account_should_hold(A) refused');
select is((select count(*)::int from engine_bucket_left('aaaaaaaa-0000-0000-0000-000000000001') where allocated > 0), 0, 'even the engine_* function sees none of A''s money through RLS');
select is((select count(*)::int from bucket_left()), 2, 'B''s own bucket_left lists only B''s buckets');
select is((select count(*)::int from account_should_hold()), 2, 'B''s own account_should_hold lists only B''s accounts');

-- ---- foreign ids smuggled into B's own rows (no FK checks the owner)
reset role;
update public.income_meta set job = 'one', "oneBucketId" = 'b1000000-0000-0000-0000-000000000001' where "ledgerEntryId" = 'inc-b1';
delete from public.allocations where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.as_b();
select throws_like($$select * from confirm_incomes(array['inc-b1'])$$, '%no "kept in" account%', 'a one-off aimed at A''s bucket is refused');
reset role;
update public.income_meta set job = 'whole' where "ledgerEntryId" = 'inc-b1';
update public.income_sources set rule = 'whole', "wholeBucketId" = 'b1000000-0000-0000-0000-000000000001' where id = 'd2000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.as_b();
select throws_like($$select * from confirm_incomes(array['inc-b1'])$$, '%no "kept in" account%', 'a whole job aimed at A''s bucket is refused');
reset role;
update public.income_sources set rule = 'own', "wholeBucketId" = null where id = 'd2000000-0000-0000-0000-000000000001';
update public.income_meta set job = 'own' where "ledgerEntryId" = 'inc-b1';
insert into public.income_source_split_lines (user_id, "sourceId", "bucketId", "percentBp") values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 10000);
set local role authenticated;
select pg_temp.as_b();
select throws_like($$select * from confirm_incomes(array['inc-b1'])$$, '%not yours%', 'an own split pointing at A''s bucket is refused');
select is((select count(*)::int from public.allocations), 0, '... and wrote nothing');

-- ---- nothing of A's changed
reset role;
select is((select al::int from _a_before), (select count(*)::int from public.allocations where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'A''s allocations unchanged');
select is((select tr::int from _a_before), (select count(*)::int from public.transfers where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'A''s transfers unchanged');
select is((select tc::int from _a_before), (select count(*)::int from public.transfer_checks where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'A''s checks unchanged');
select is((select cy::int from _a_before), (select count(*)::int from public.transfer_cycles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and "closedAt" is null), 'A''s cycle still open');
select is((select count(*)::int from public.ledger_entries where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and "deletedAt" is not null), 0, 'none of A''s entries were soft-deleted');

select * from finish();
rollback;
