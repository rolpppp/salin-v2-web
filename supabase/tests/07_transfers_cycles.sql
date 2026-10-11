-- Transfer checklist behaviour: tick / untick (BR 3.6, 3.7; shape of the rows mobile pulls), netting never over a
-- sent transfer (G8), allocation snapshots vs later "kept in" changes (G12), and transfer cycles (P-3).
begin;
select plan(76);

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

-- ---- nothing to tick before anything is confirmed
select throws_like($$select tick_transfer('acc-mari', 'acc-mp2', 100)$$, '%no open transfer cycle%', 'tick with no cycle: refused');
select throws_like($$select untick_transfer('acc-mari', 'acc-mp2')$$, '%no transfer cycle%', 'untick with no cycle: refused');
select is((select count(*)::int from transfer_plan()), 0, 'no cycle: empty checklist');

-- ---- G8: confirm G2, tick MariBank -> GCash or Maya (230000), then confirm the rest: no netting
savepoint g8;
select is((select count(*)::int from confirm_incomes(array['inc-g2'])), 7, 'G8: confirm G2 first');
select is(pg_temp.plan_rows(), array[
  'keep acc-mari>acc-mari 989000 net 0 sent 0',
  'transfer acc-mari>acc-cash 161000 net 0 sent 0',
  'transfer acc-mari>acc-mp2 690000 net 0 sent 0',
  'transfer acc-mari>acc-tonik 230000 net 0 sent 0',
  'transfer acc-mari>acc-gcash 230000 net 0 sent 0'], 'G8: G2 alone');
select lives_ok($$select tick_transfer('acc-mari', 'acc-gcash', 230000)$$, 'G8: tick MariBank -> GCash or Maya 230000');
select is((select count(*)::int from confirm_incomes(array['inc-g5', 'inc-allow'])), 4, 'G8: confirm the rest (joins the open cycle)');
select is(pg_temp.plan_rows(), array[
  'keep acc-mari>acc-mari 989000 net 0 sent 0',
  'keep acc-gcash>acc-gcash 175000 net 0 sent 0',
  'keep acc-cash>acc-cash 150000 net 0 sent 0',
  'transfer acc-mari>acc-cash 161000 net 0 sent 0',
  'transfer acc-mari>acc-mp2 690000 net 0 sent 0',
  'transfer acc-mari>acc-tonik 230000 net 0 sent 0',
  'transfer acc-mari>acc-gcash 230000 net 0 sent 230000',
  'transfer acc-gcash>acc-mari 35000 net 0 sent 0',
  'transfer acc-gcash>acc-tonik 140000 net 0 sent 0'], 'G8: no netting over the sent transfer; GCash or Maya -> MariBank 35000 appears');
select is((select done::text || '|' || status from transfer_plan() where from_account_id = 'acc-mari' and to_account_id = 'acc-gcash'), 'true|done', 'G8: the sent transfer stays done');
select is((select count(*)::int from public.transfer_cycles), 1, 'G8: the later confirm joined the open cycle');
rollback to savepoint g8;

-- ---- state for the rest: G7 confirmed
select is((select count(*)::int from confirm_incomes(array['inc-g2', 'inc-g5', 'inc-allow'])), 11, 'G7 confirmed');
create temp table _t (k text, id text);
grant all on _t to authenticated;

-- ---- tick: the exact shape mobile creates (transaction_repository_impl createTransfer)
insert into _t select 'mp2', tick_transfer('acc-mari', 'acc-mp2', 690000);
select matches((select id from _t where k = 'mp2'), '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'transfer id is a uuid string');
select is((select "fromAccountId" || '>' || "toAccountId" || '|' || note || '|' || "syncStatus" || '|' || coalesce("deletedAt"::text, 'null') from public.transfers where id = (select id from _t where k = 'mp2')),
  'acc-mari>acc-mp2|Transfer|2|null', 'transfers row: accounts, note Transfer, syncStatus 2, not deleted');
select ok((select abs("updatedAt" - public.now_ms()) < 60000 and abs("createdAt" - public.now_ms()) < 60000 from public.transfers where id = (select id from _t where k = 'mp2')), 'transfers row: createdAt and updatedAt are server now in epoch ms');
select is(array(select id || '|' || "accountId" || '|' || direction || '|' || origin || '|' || "amountMinor" || '|' || coalesce("categoryId", 'null') || '|' || "syncStatus" || '|' || "transferId" || '|' || note || '|' || coalesce("deletedAt"::text, 'null')
                  from public.ledger_entries where "transferId" = (select id from _t where k = 'mp2') order by id),
  array[(select id from _t where k = 'mp2') || '_in|acc-mp2|0|3|690000|null|2|' || (select id from _t where k = 'mp2') || '|Transfer|null',
        (select id from _t where k = 'mp2') || '_out|acc-mari|1|3|690000|null|2|' || (select id from _t where k = 'mp2') || '|Transfer|null'],
  'two legs: <id>_out outflow from, <id>_in inflow to, origin 3, categoryId null, syncStatus 2');
select is((select count(distinct "occurredAt")::int from public.ledger_entries where "transferId" = (select id from _t where k = 'mp2')), 1, 'both legs share occurredAt');
select ok((select bool_and(abs("updatedAt" - public.now_ms()) < 60000) from public.ledger_entries where "transferId" = (select id from _t where k = 'mp2')), 'legs: updatedAt is server now');
select is((select "sentMinor"::text || '|' || "periodKey" || '|' || "transferId" || '|' || array_length("transferIds", 1) from public.transfer_checks where "toAccountId" = 'acc-mp2'),
  '690000|' || (select id::text from public.transfer_cycles) || '|' || (select id from _t where k = 'mp2') || '|1', 'transfer_checks: amount sent, periodKey = cycle id, transfer id');
select is((select sent || '|' || done::text || '|' || status from transfer_plan() where to_account_id = 'acc-mp2'), '690000|true|done', 'plan shows it done');
select throws_like($$select tick_transfer('acc-mari', 'acc-mp2', 690000)$$, '%already sent 690000%', 'ticking again at the same amount is refused (no duplicate)');
select is((select count(*)::int from public.transfers), 1, '... no second transfers row');
select is((select count(*)::int from public.ledger_entries where origin = 3), 2, '... no extra legs');
select is((select count(*)::int from public.transfer_checks), 1, '... still one check row');

-- ---- refusals
select throws_like($$select tick_transfer('acc-mari', 'acc-mari', 100)$$, '%must differ%', 'from = to refused');
select throws_like($$select tick_transfer('acc-mari', 'acc-tonik', 0)$$, '%amount must be > 0%', 'amount 0 refused');
select throws_like($$select tick_transfer('acc-mari', 'acc-tonik', -5)$$, '%amount must be > 0%', 'negative amount refused');
select throws_like($$select tick_transfer('acc-tonik', 'acc-mari', 100)$$, '%no transfer acc-tonik -> acc-mari%', 'a pair that is not on the checklist is refused');
select throws_like($$select tick_transfer('acc-mari', 'acc-nope', 100)$$, '%account not found%', 'unknown account refused');
select throws_like($$select untick_transfer('acc-mari', 'acc-tonik')$$, '%nothing ticked%', 'untick of an unticked pair refused');

-- ---- partial tick, then "send more": only the difference moves (BR 3.7)
select lives_ok($$select tick_transfer('acc-mari', 'acc-tonik', 100000)$$, 'partial tick 100000 of 230000');
select is((select status || '|' || sent || '|' || send_more from transfer_plan() where to_account_id = 'acc-tonik' and from_account_id = 'acc-mari'), 'partial|100000|130000', 'plan: partial, send 130000 more');
select lives_ok($$select tick_transfer('acc-mari', 'acc-tonik', 230000)$$, 'tick the full 230000 (total sent)');
select is((select count(*)::int from public.transfers where "toAccountId" = 'acc-tonik' and "deletedAt" is null), 2, 'two transfers exist for the pair');
select is((select sum("amountMinor")::int from public.ledger_entries where direction = 1 and origin = 3 and "accountId" = 'acc-mari' and "transferId" in (select id from public.transfers where "toAccountId" = 'acc-tonik')),
  230000, 'the second one moved only the 130000 difference (100000 + 130000 = 230000 out)');
select is((select "sentMinor"::text || '|' || array_length("transferIds", 1) from public.transfer_checks where "toAccountId" = 'acc-tonik'), '230000|2', 'check row: sent 230000, two transfers recorded');
select is((select status from transfer_plan() where from_account_id = 'acc-mari' and to_account_id = 'acc-tonik'), 'done', 'plan: done');
-- untick soft-deletes everything it wrote
select lives_ok($$select untick_transfer('acc-mari', 'acc-tonik')$$, 'untick MariBank -> Tonik');
select is((select count(*)::int from public.transfers where "toAccountId" = 'acc-tonik'), 2, 'untick never hard-deletes the transfers');
select is((select count(*)::int from public.transfers where "toAccountId" = 'acc-tonik' and "deletedAt" is not null and "syncStatus" = 2), 2, '... it soft-deletes them (deletedAt set, syncStatus 2)');
select is((select count(*)::int from public.ledger_entries where "transferId" in (select id from public.transfers where "toAccountId" = 'acc-tonik')), 4, 'all four legs still exist');
select is((select count(*)::int from public.ledger_entries where "transferId" in (select id from public.transfers where "toAccountId" = 'acc-tonik') and "deletedAt" is not null), 4, '... all soft-deleted');
select ok((select bool_and(abs("updatedAt" - public.now_ms()) < 60000 and "updatedAt" >= "createdAt") from public.ledger_entries where "transferId" in (select id from public.transfers where "toAccountId" = 'acc-tonik')), 'soft delete stamps updatedAt (so mobile pulls it)');
select is((select count(*)::int from public.transfer_checks where "toAccountId" = 'acc-tonik' and "deletedAt" is not null), 1, 'the check row is soft-deleted, not removed');
select is((select status || '|' || sent from transfer_plan() where from_account_id = 'acc-mari' and to_account_id = 'acc-tonik'), 'unsent|0', 'plan: unsent again');
select is((select count(*)::int from public.transfers where "toAccountId" = 'acc-mp2' and "deletedAt" is null), 1, 'other ticked transfers are untouched');
-- tick again after untick: a fresh transfer
insert into _t select 'tonik2', tick_transfer('acc-mari', 'acc-tonik', 230000);
select is((select "transferIds" from public.transfer_checks where "toAccountId" = 'acc-tonik'), array[(select id from _t where k = 'tonik2')], 're-tick starts a fresh transfer list');
select is((select count(*)::int from public.transfers where "toAccountId" = 'acc-tonik' and "deletedAt" is null), 1, '... exactly one live transfer');

-- ---- G12: moving "Kept in" later changes nothing that is confirmed
create temp table _before as select pg_temp.plan_rows() as rows;
grant all on _before to authenticated;
select is((select should_hold from account_should_hold() where account_id = 'acc-mp2'), 690000::bigint, 'G12 before: Pag-IBIG MP2 should hold 690000');
select is((select bucket_kept_here from account_should_hold() where account_id = 'acc-mp2'), true, 'G12 before: a bucket is kept in MP2');
update public.buckets set "keptInAccountId" = 'acc-tonik' where hue = 'invest';
select is(pg_temp.plan_rows(), (select rows from _before), 'G12: the transfer list is unchanged');
select is((select allocated_here || '|' || should_hold || '|' || bucket_kept_here::text from account_should_hold() where account_id = 'acc-mp2'), '690000|690000|false',
  'G12: Pag-IBIG MP2 still should hold its earlier share; no bucket is kept there now');
select is((select allocated_here || '|' || should_hold from account_should_hold() where account_id = 'acc-tonik'), '370000|370000', 'G12: Tonik should hold only what was allocated to it (not the moved bucket''s earlier money)');
select is((select "destAccountId" from public.allocations where "ledgerEntryId" = 'inc-g2' and "bucketId" = 'b1000000-0000-0000-0000-000000000005'), 'acc-mp2', 'G12: the allocation snapshot is untouched');
update public.buckets set "keptInAccountId" = 'acc-mp2' where hue = 'invest';

-- ---- closing the cycle: tick everything that is left
select lives_ok($$select tick_transfer('acc-mari', 'acc-cash', 161000)$$, 'tick 1 of 4 remaining');
select lives_ok($$select tick_transfer('acc-mari', 'acc-gcash', 195000)$$, 'tick 2 of 4 remaining (netted amount)');
select is((select count(*)::int from public.transfer_cycles where "closedAt" is null), 1, 'cycle still open with one transfer left');
select lives_ok($$select tick_transfer('acc-gcash', 'acc-tonik', 140000)$$, 'tick 3 of 4 remaining');
select is((select count(*)::int from public.transfer_cycles where "closedAt" is not null), 1, 'P-3: the cycle closes when every transfer is done');
select is((select count(*)::int from transfer_plan() where kind = 'transfer' and not done), 0, 'nothing left to send');
select throws_like($$select tick_transfer('acc-mari', 'acc-cash', 200000)$$, '%no open transfer cycle%', 'a closed cycle cannot be ticked');
-- unticking the latest cycle reopens it
select lives_ok($$select untick_transfer('acc-gcash', 'acc-tonik')$$, 'untick in the latest (closed) cycle');
select is((select count(*)::int from public.transfer_cycles where "closedAt" is null), 1, 'P-3: unticking reopens the cycle');
select lives_ok($$select tick_transfer('acc-gcash', 'acc-tonik', 140000)$$, 'tick it again: closes again');

-- ---- P-3: new money after a closed cycle opens a new cycle; older cycles are history
select is((select count(*)::int from confirm_incomes(array['inc-g1'])), 7, 'confirm another payday after the cycle closed');
select is((select count(*)::int from public.transfer_cycles), 2, 'a second cycle exists');
select is((select count(*)::int from public.transfer_cycles where "closedAt" is null), 1, 'at most one open cycle');
select is((select count(distinct "transferCycleId")::int from public.allocations where "ledgerEntryId" = 'inc-g1'), 1, 'the new allocations belong to the new cycle');
select is((select count(*)::int from transfer_plan() where kind = 'transfer'), 4, 'transfer_plan reads the latest cycle only (4 transfers from Oct 7, none from earlier cycle)');
select is((select sent from transfer_plan() where kind = 'transfer' and to_account_id = 'acc-mp2'), 0::bigint, 'the new cycle starts unsent even though MariBank -> MP2 was sent in the old one');
select throws_like($$select untick_transfer('acc-mari', 'acc-cash')$$, '%nothing ticked%', 'only the latest cycle can be unticked');
select is((select count(*)::int from public.transfers where "deletedAt" is null), 5, 'old cycle transfers are left alone');
-- the new cycle ticks on its own
select lives_ok($$select tick_transfer('acc-mari', 'acc-mp2', 519870)$$, 'tick in the new cycle');
select is((select count(*)::int from public.transfer_checks where "deletedAt" is null), 6, 'checks are per cycle: the same pair can be ticked in both');

-- ---- a cycle with only "keep" lines closes immediately
reset role;
delete from public.transfer_checks;
delete from public.allocations;
update public.transfer_cycles set "closedAt" = 1;
update public.income_meta set job = null where "ledgerEntryId" = 'inc-allow';
set local role authenticated;
select pg_temp.as_a();
select is((select count(*)::int from confirm_incomes(array['inc-allow'])), 1, 'confirm an income that is already where it should be');
select is((select count(*)::int from public.transfer_cycles where "closedAt" is null), 0, 'nothing to send: the cycle is closed right away');
select is(pg_temp.plan_rows(), array['keep acc-cash>acc-cash 150000 net 0 sent 0'], 'the checklist is a single keep row');

select * from finish();
rollback;
