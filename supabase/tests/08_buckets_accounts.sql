-- bucket_left (BR 4.2), covers (BR 4.3), account_should_hold (BR 5.1), the Plan B switch measure (D-14),
-- and P-4: an income the phone deletes drops out of every number while its allocation rows stay.
-- G9 and G10 at SQL level.
begin;
select plan(43);

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

set local role authenticated;
select pg_temp.as_a();
create function pg_temp.left_of(p_hue text) returns bigint language sql as $$
  select l.left_minor from public.bucket_left() l join public.buckets b on b.id = l.bucket_id where b.hue = p_hue $$;

-- ---- G9: the prototype's starting state: Oct 7 split + spending Living 130000, Fun 130050
select is((select count(*)::int from confirm_incomes(array['inc-g1'])), 7, 'confirm the Oct 7 payday');
insert into public.ledger_entries (id, user_id, "accountId", "categoryId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus")
select 'sp-' || n, auth.uid(), 'acc-cash', c, a, 1, 0, pg_temp.ms('2026-10-09'), 1, 1, 2
  from (values (1, 'cat-living', 61250), (2, 'cat-living', 18000), (3, 'cat-living', 35750), (4, 'cat-living', 15000), (5, 'cat-fun', 52050), (6, 'cat-fun', 78000)) v(n, c, a);
select is((select count(*)::int from public.entry_buckets), 6, 'each spending entry got its bucket from its category (trigger)');
select is(pg_temp.left_of('living'), -8697::bigint, 'G9: Living left -8697 (Needs 86.97)');
select is(pg_temp.left_of('fun'), 43240::bigint, 'G9: Fun left 43240');
select is((select sum(l.left_minor)::bigint from bucket_left() l join public.buckets b on b.id = l.bucket_id where b."groupKey" = 'spend'), 34543::bigint, 'G9: safe to spend 34543 (Spend group, negative Living counted as is)');
select is((select spent::text || '|' || allocated from bucket_left() l join public.buckets b on b.id = l.bucket_id where b.hue = 'living'), '130000|121303', 'G9: Living spent 130000 of 121303 allocated');
select is((select count(*)::int from bucket_left()), 9, 'one row per bucket, including ones with nothing');
select is((select left_minor from bucket_left() l join public.buckets b on b.id = l.bucket_id where b.hue = 'dost'), 0::bigint, 'a bucket with no flows has left 0');

-- ---- covers (BR 4.3, D-19): how much is decided by the caller, the function validates and records
select is(pg_temp.left_of('buffer'), 86645::bigint, 'Buffer left 86645');
select lives_ok($$select cover_bucket('b1000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000002', 8697)$$, 'cover Living''s 8697 from Buffer');
select is(pg_temp.left_of('living'), 0::bigint, 'Living is back to 0');
select is(pg_temp.left_of('buffer'), 77948::bigint, 'Buffer left 77948');
select is((select covers_in::text || '|' || covers_out from bucket_left() l join public.buckets b on b.id = l.bucket_id where b.hue = 'living'), '8697|0', 'covers in / out are reported');
select throws_like($$select cover_bucket('b1000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000002', 77949)$$, '%only 77948 is left%', 'cannot cover more than the source has left');
select throws_like($$select cover_bucket('b1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 1)$$, '%from itself%', 'cannot cover from itself');
select throws_like($$select cover_bucket('b1000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000002', 0)$$, '%must be > 0%', 'cover amount must be > 0');
select throws_ok($$select cover_bucket('b1000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-0000000000ff', 5)$$, 'P0002', null, 'unknown bucket');

-- ---- G10: Emergency at 554528, then G2 confirmed
select is(pg_temp.left_of('emergency'), 554528::bigint, 'G10: Emergency at 554528');
select is((select count(*)::int from confirm_incomes(array['inc-g2'])), 7, 'confirm G2');
select is(pg_temp.left_of('emergency'), 1290528::bigint, 'G10: Emergency 1290528 (25.8% of 5000000)');
select is(active_plan(), 'A', 'G10: still Plan A (target 5000000 not reached)');
select is(engine_plan_measure(auth.uid(), 'b1000000-0000-0000-0000-000000000004'), 1290528::bigint, 'D-14 measure: sum of Emergency allocations');

-- the D-14 measure ignores withdrawals: spending from Emergency lowers left but not the measure
insert into public.category_buckets (user_id, "categoryId", "bucketId", source) values (auth.uid(), 'cat-misc', 'b1000000-0000-0000-0000-000000000004', 'user');
insert into public.ledger_entries (id, user_id, "accountId", "categoryId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus")
values ('sp-em', auth.uid(), 'acc-mari', 'cat-misc', 90000, 1, 0, pg_temp.ms('2026-10-10'), 1, 1, 2);
select is(pg_temp.left_of('emergency'), 1200528::bigint, 'spending from Emergency lowers its left');
select is(engine_plan_measure(auth.uid(), 'b1000000-0000-0000-0000-000000000004'), 1290528::bigint, 'D-14: the plan switch measure ignores withdrawals');

update public.allocation_rules set params = jsonb_set(params, '{targetMinor}', '1000000') where id = 'c1000000-0000-0000-0000-000000000001';
select is(active_plan(), 'B', 'target 1000000, measure 1290528: Plan B');

-- ---- account_should_hold (BR 5.1)
select is((select allocated_here || '|' || buckets_net || '|' || should_hold || '|' || bucket_kept_here::text from account_should_hold() where account_id = 'acc-cash'), '282303|-121303|161000|true',
  'Cash: Living allocations (both paydays) + covers in - spending');
select is((select allocated_here || '|' || buckets_net || '|' || should_hold || '|' || bucket_kept_here::text from account_should_hold() where account_id = 'acc-mp2'), '1209870|0|1209870|true', 'MP2: Investments allocations, nothing spent');
select is((select allocated_here || '|' || buckets_net || '|' || should_hold from account_should_hold() where account_id = 'acc-mari'), '1734147|-98697|1635450',
  'MariBank: allocations to its buckets, less spending from Emergency and the cover paid out of Buffer');
select is((select allocated_here || '|' || buckets_net || '|' || should_hold from account_should_hold() where account_id = 'acc-gcash'), '403290|-130050|273240', 'GCash or Maya: Fun allocations less Fun spending');
select is((select count(*)::int from account_should_hold()), 5, 'one row per account');
select is((select currency from account_should_hold() where account_id = 'acc-tonik'), 'PHP', 'currency is reported');

-- ---- P-4: the phone soft-deletes an income that was already split
select lives_ok($$update public.ledger_entries set "deletedAt" = 5 where id = 'inc-g2'$$, 'the phone soft-deletes the G2 income');
select is((select count(*)::int from public.allocations where "ledgerEntryId" = 'inc-g2' and "deletedAt" is null), 7, 'P-4: its allocation rows stay (immutable history)');
select is(pg_temp.left_of('emergency'), 464528::bigint, 'P-4: excluded from left (554528 - 90000 spent)');
select is(engine_plan_measure(auth.uid(), 'b1000000-0000-0000-0000-000000000004'), 554528::bigint, 'P-4: excluded from the D-14 measure');
select is(pg_temp.plan_rows(), array[
  'keep acc-mari>acc-mari 745147 net 0 sent 0',
  'transfer acc-mari>acc-cash 121303 net 0 sent 0',
  'transfer acc-mari>acc-mp2 519870 net 0 sent 0',
  'transfer acc-mari>acc-tonik 173290 net 0 sent 0',
  'transfer acc-mari>acc-gcash 173290 net 0 sent 0'], 'P-4: excluded from the transfer checklist');
select is((select allocated_here from account_should_hold() where account_id = 'acc-mp2'), 519870::bigint, 'P-4: excluded from should-hold');
select is((select sum(l.left_minor)::bigint from bucket_left() l join public.buckets b on b.id = l.bucket_id where b."groupKey" = 'spend'), (121303 - 130000 + 8697 + 173290 - 130050)::bigint, 'P-4: excluded from safe to spend');
-- ... and a hard delete from the phone behaves the same (allocations.ledgerEntryId is set null by the FK)
select lives_ok($$delete from public.ledger_entries where id = 'inc-g2'$$, 'the phone hard-deletes the income');
select is((select count(*)::int from public.allocations where "ledgerEntryId" is null), 7, 'P-4: allocation rows stay, detached');
select is(pg_temp.left_of('emergency'), 464528::bigint, 'P-4: a hard delete is excluded too');
select is((select count(*)::int from transfer_plan() where kind = 'transfer'), 4, 'P-4: and from the checklist');

select is(active_plan(), 'A', 'P-4: with the G2 income deleted the measure is 554528 < 1000000: back to Plan A');

select * from finish();
rollback;
