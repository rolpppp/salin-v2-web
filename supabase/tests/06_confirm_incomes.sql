-- confirm_incomes: job resolution (BR 2.1), allocation rows with destination snapshots (BR 2.6), G7 in one go,
-- idempotency, in-batch plan switch (BR 2.2.1), P-3 cycle membership, and the refusals.
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

-- ---- refusals: nothing is written
select throws_like($$select * from confirm_incomes(array['inc-ask'])$$, '%Needs a job%', 'rule "ask" and no job picked: refused');
select throws_like($$select * from confirm_incomes(array['inc-own90'])$$, '%adds to 90.00 percent%', 'G6: own split of 90 is not confirmable');
select throws_like($$select * from confirm_incomes(array['inc-g2', 'inc-ask'])$$, '%Needs a job%', 'one income without a job refuses the whole call');
select is((select count(*)::int from public.allocations), 0, 'refusal wrote no allocations (atomic)');
select is((select count(*)::int from public.transfer_cycles), 0, 'refusal opened no cycle');
select throws_ok($$select * from confirm_incomes(array['nope'])$$, 'P0002', null, 'unknown id: refused');
select is((select count(*)::int from confirm_incomes(array[]::text[])), 0, 'empty list: nothing happens');
select is((select count(*)::int from confirm_incomes(null)), 0, 'null list: nothing happens');
select throws_ok($$select * from confirm_incomes(array['inc-b1'])$$, 'P0002', null, 'another user''s income id: refused');

-- ---- G7: confirm G2 (Others, plan job, landed MariBank), G5 (own split, GCash or Maya) and the allowance (whole -> Living, cash) in one go
select is((select count(*)::int from confirm_incomes(array['inc-g5', 'inc-allow', 'inc-g2'])), 11, 'G7: 7 + 3 + 1 allocation lines (zero lines are not written)');
select is((select jsonb_object_agg(b.hue, a."amountMinor") from public.allocations a join public.buckets b on b.id = a."bucketId" where a."ledgerEntryId" = 'inc-g2'),
  '{"tax":138000,"living":161000,"emergency":736000,"invest":690000,"sinking":230000,"fun":230000,"buffer":115000}'::jsonb, 'G2 lines');
select is((select jsonb_object_agg(b.hue, a."amountMinor") from public.allocations a join public.buckets b on b.id = a."bucketId" where a."ledgerEntryId" = 'inc-g5'),
  '{"tax":35000,"sinking":140000,"fun":175000}'::jsonb, 'G5 lines');
select is((select jsonb_object_agg(b.hue, a."amountMinor") from public.allocations a join public.buckets b on b.id = a."bucketId" where a."ledgerEntryId" = 'inc-allow'),
  '{"living":150000}'::jsonb, 'allowance goes whole to Living');
select is(pg_temp.plan_rows(), array[
  'keep acc-mari>acc-mari 1024000 net 35000 sent 0',
  'keep acc-gcash>acc-gcash 210000 net 35000 sent 0',
  'keep acc-cash>acc-cash 150000 net 0 sent 0',
  'transfer acc-mari>acc-cash 161000 net 0 sent 0',
  'transfer acc-mari>acc-mp2 690000 net 0 sent 0',
  'transfer acc-mari>acc-tonik 230000 net 0 sent 0',
  'transfer acc-mari>acc-gcash 195000 net 35000 sent 0',
  'transfer acc-gcash>acc-tonik 140000 net 0 sent 0'], 'G7: the checklist (keep rows with netting, 5 transfers)');

-- snapshots (BR 2.6)
select is((select jsonb_object_agg(b.hue, a."destAccountId") from public.allocations a join public.buckets b on b.id = a."bucketId" where a."ledgerEntryId" = 'inc-g2'),
  '{"tax":"acc-mari","living":"acc-cash","emergency":"acc-mari","invest":"acc-mp2","sinking":"acc-tonik","fun":"acc-gcash","buffer":"acc-mari"}'::jsonb,
  'each line snapshots its bucket''s account at confirm time');
select is((select "planKey" || '|' || "percentBp" from public.allocations a where a."ledgerEntryId" = 'inc-g2' and a."bucketId" = 'b1000000-0000-0000-0000-000000000004'), 'A|3200',
  'plan key and the percentage actually used (Emergency 30% + redirected Rent 2%) are stored');
select is((select count(*)::int from public.allocations where "ledgerEntryId" = 'inc-g5' and "planKey" is not null), 0, 'an own split has no plan key');
select is((select ("ruleTrace" ->> 'job') || '|' || ("ruleTrace" ->> 'jobFrom') || '|' || ("ruleTrace" -> 'redirect' ->> 'applied') from public.allocations where "ledgerEntryId" = 'inc-g2' limit 1),
  'plan|source|true', 'rule trace: job, where it came from, rent redirect applied');
select is((select ("ruleTrace" ->> 'job') || '|' || ("ruleTrace" ->> 'ownTotalBp') from public.allocations where "ledgerEntryId" = 'inc-g5' limit 1), 'own|10000', 'rule trace of an own split');
select is((select count(distinct "transferCycleId")::int from public.allocations), 1, 'P-3: all incomes confirmed together join one cycle');
select is((select count(*)::int from public.transfer_cycles where "closedAt" is null), 1, 'P-3: that cycle is open');
select ok((select bool_and("confirmedAt" > 1700000000000 and "updatedAt" > 1700000000000) from public.allocations), 'confirmedAt and updatedAt are server-time epoch ms');

-- ---- idempotency
select is((select count(*)::int from confirm_incomes(array['inc-g2', 'inc-g5', 'inc-allow'])), 0, 'confirming again returns and writes nothing');
select is((select count(*)::int from public.allocations), 11, 'still 11 allocation rows');
select is((select count(*)::int from public.transfer_cycles), 1, 'still one cycle');
select is((select count(*)::int from confirm_incomes(array['inc-g2', 'inc-g2'])), 0, 'a duplicated id in the input is harmless');

-- ---- the in-batch plan switch (BR 2.2.1): the first income can switch the plan for the next
reset role;
update public.allocation_rules set params = jsonb_set(params, '{targetMinor}', '554528') where id = 'c1000000-0000-0000-0000-000000000001';
delete from public.allocations;
set local role authenticated;
select pg_temp.as_a();
select is((select count(*)::int from confirm_incomes(array['inc-g2', 'inc-g1'])), 14, 'g1 and g2 confirmed together (input order is irrelevant)');
select is((select string_agg(distinct "planKey", ',') from public.allocations where "ledgerEntryId" = 'inc-g1'), 'A', 'earlier income (Oct 7) is split by Plan A');
select is((select string_agg(distinct "planKey", ',') from public.allocations where "ledgerEntryId" = 'inc-g2'), 'B', 'next income (Oct 8) is split by Plan B: Emergency reached the target');
select is((select jsonb_object_agg(b.hue, a."amountMinor") from public.allocations a join public.buckets b on b.id = a."bucketId" where a."ledgerEntryId" = 'inc-g2'),
  '{"tax":138000,"living":161000,"emergency":276000,"invest":1150000,"sinking":230000,"fun":230000,"buffer":115000}'::jsonb, 'Plan B amounts for 2300000 (Emergency 10% + 2% redirected Rent)');
select is(active_plan(), 'B', 'active_plan now reports B');

-- ---- one-off and whole jobs, and their refusals
reset role;
delete from public.allocations;
update public.income_meta set job = 'one', "oneBucketId" = 'b1000000-0000-0000-0000-000000000007' where "ledgerEntryId" = 'inc-allow';
set local role authenticated;
select pg_temp.as_a();
select is((select count(*)::int from confirm_incomes(array['inc-allow'])), 1, 'one-off income: one line');
select is((select b.hue || '|' || a."amountMinor" || '|' || a."percentBp" || '|' || a."destAccountId" from public.allocations a join public.buckets b on b.id = a."bucketId" where a."ledgerEntryId" = 'inc-allow'),
  'fun|150000|10000|acc-gcash', 'the job picked for this income beats the source rule; all to the picked bucket');
reset role;
delete from public.allocations;
update public.income_meta set "oneBucketId" = null where "ledgerEntryId" = 'inc-allow';
set local role authenticated;
select pg_temp.as_a();
select is((select count(*)::int from confirm_incomes(array['inc-allow'])), 1, 'one-off without a bucket');
select is((select b.hue from public.allocations a join public.buckets b on b.id = a."bucketId" where a."ledgerEntryId" = 'inc-allow'), 'emergency', 'one-off defaults to Emergency');
reset role;
delete from public.allocations;
update public.income_meta set "oneBucketId" = 'b1000000-0000-0000-0000-000000000003' where "ledgerEntryId" = 'inc-allow';
set local role authenticated;
select pg_temp.as_a();
select throws_like($$select * from confirm_incomes(array['inc-allow'])$$, '%Rent cannot be picked%', 'Rent cannot be picked for a one-off income');
reset role;
update public.income_meta set job = 'whole', "oneBucketId" = null where "ledgerEntryId" = 'inc-ask';
set local role authenticated;
select pg_temp.as_a();
select throws_like($$select * from confirm_incomes(array['inc-ask'])$$, '%kept whole but its source has no bucket%', 'whole job on a source without a bucket: refused');

-- ---- a bucket with no home cannot be confirmed into
reset role;
update public.buckets set "keptInAccountId" = null where id = 'b1000000-0000-0000-0000-000000000007';
set local role authenticated;
select pg_temp.as_a();
select throws_like($$select * from confirm_incomes(array['inc-g5'])$$, '%has no "kept in" account%', 'a bucket without a kept-in account refuses the confirm');
select is((select count(*)::int from public.allocations), 0, '... and wrote nothing');

-- ---- only real inflows
reset role;
insert into public.ledger_entries (id, user_id, "accountId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('spend-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-cash', 100, 1, 0, pg_temp.ms('2026-10-10'), 1, 1, 2),
  ('trin-1',  'aaaaaaaa-0000-0000-0000-000000000001', 'acc-cash', 100, 0, 3, pg_temp.ms('2026-10-10'), 1, 1, 2),
  ('gone-1',  'aaaaaaaa-0000-0000-0000-000000000001', 'acc-cash', 100, 0, 0, pg_temp.ms('2026-10-10'), 1, 1, 2);
update public.ledger_entries set "deletedAt" = 5 where id = 'gone-1';
set local role authenticated;
select pg_temp.as_a();
select throws_ok($$select * from confirm_incomes(array['spend-1'])$$, 'P0002', null, 'an outflow is not an income');
select throws_ok($$select * from confirm_incomes(array['trin-1'])$$, 'P0002', null, 'a transfer leg is not an income');
select throws_ok($$select * from confirm_incomes(array['gone-1'])$$, 'P0002', null, 'a deleted income cannot be confirmed');

-- ---- signed out
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select * from confirm_incomes(array['inc-g2'])$$, '28000', null, 'no signed-in user: refused');

select * from finish();
rollback;
