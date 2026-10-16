-- Starting money (ticket 38, P-14): sorting real balances into buckets, undo/remove, move between buckets,
-- the week slip identity, and RLS on bucket_starts.
-- Golden case (the owner's screenshot): GCash keeps Spending + Fun, MariBank keeps Emergency + Buffer + Goals,
-- GoTrade keeps Investment, Cash keeps no bucket. Every account holds money from before the plan.
begin;
select plan(82);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus") values
  ('acc-gc',   'aaaaaaaa-0000-0000-0000-000000000001', 'GCash',    3, 1500000, 'PHP', 'i', 1, false, 1, 1, 2),
  ('acc-bank', 'aaaaaaaa-0000-0000-0000-000000000001', 'MariBank', 1, 2000000, 'PHP', 'i', 2, false, 1, 1, 2),
  ('acc-gt',   'aaaaaaaa-0000-0000-0000-000000000001', 'GoTrade',  6,  500000, 'PHP', 'i', 3, false, 1, 1, 2),
  ('acc-cash', 'aaaaaaaa-0000-0000-0000-000000000001', 'Cash',     0,  300000, 'PHP', 'i', 4, false, 1, 1, 2),
  ('acc-aud',  'aaaaaaaa-0000-0000-0000-000000000001', 'AUD acct', 1,  100000, 'AUD', 'i', 5, false, 1, 1, 2),
  ('acc-old',  'aaaaaaaa-0000-0000-0000-000000000001', 'Old',      1,   50000, 'PHP', 'i', 6, true,  1, 1, 2),
  ('acc-b',    'bbbbbbbb-0000-0000-0000-000000000002', 'B Bank',   1,  700000, 'PHP', 'i', 1, false, 1, 1, 2);

insert into public.buckets (id, user_id, name, "groupKey", hue, "keptInAccountId", planless, "displayOrder", "isArchived") values
  ('51000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Spending',   'spend',     'living',    'acc-gc',   false, 1, false),
  ('51000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fun money',  'spend',     'fun',       'acc-gc',   false, 2, false),
  ('51000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emergency',  'save',      'emergency', 'acc-bank', false, 3, false),
  ('51000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Buffer',     'set_aside', 'buffer',    'acc-bank', false, 4, false),
  ('51000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Goals',      'save',      'c3',        'acc-bank', false, 5, false),
  ('51000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'Investment', 'save',      'invest',    'acc-gt',   false, 6, false),
  ('51000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'Archived',   'save',      null,        'acc-bank', false, 7, true),
  ('52000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'B Living',   'spend',     'living',    'acc-b',    false, 1, false);

insert into public.allocation_plans (id, user_id, key, name) values
  ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'A', 'Plan A');
insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', '51000000-0000-0000-0000-000000000001', 4000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', '51000000-0000-0000-0000-000000000002', 1000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', '51000000-0000-0000-0000-000000000003', 3000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', '51000000-0000-0000-0000-000000000004', 500),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', '51000000-0000-0000-0000-000000000005', 500),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', '51000000-0000-0000-0000-000000000006', 1000);
insert into public.income_sources (id, user_id, name, kind, rule, "landsInAccountId") values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Work', 'salary', 'plan', 'acc-gc');
insert into public.user_profiles (user_id, "firstName", "onboardedAt", "weekStartsOn") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana', 1, 1),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Ben', 1, 1);

create function pg_temp.as_a() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true) $$;
create function pg_temp.as_b() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true) $$;
create function pg_temp.hold(p_acct text) returns bigint language sql as $$
  select should_hold from public.account_should_hold() where account_id = p_acct $$;
create function pg_temp.free(p_acct text) returns bigint language sql as $$
  select unbucketed_minor from public.account_balances() where account_id = p_acct $$;
create function pg_temp.left_of(p_bucket text) returns bigint language sql as $$
  select left_minor from public.bucket_left() where bucket_id = p_bucket::uuid $$;
create function pg_temp.ago(p_days numeric) returns bigint language sql as $$ select public.now_ms() - (p_days * 86400000)::bigint $$;
grant execute on function pg_temp.hold(text) to authenticated;
grant execute on function pg_temp.free(text) to authenticated;
grant execute on function pg_temp.left_of(text) to authenticated;
grant execute on function pg_temp.ago(numeric) to authenticated;

select has_table('public', 'bucket_starts', 'bucket_starts exists');
select ok((select relrowsecurity from pg_class where oid = 'public.bucket_starts'::regclass), 'bucket_starts has RLS');
select ok(not has_table_privilege('anon', 'public.bucket_starts', 'select'), 'anon cannot read bucket_starts');
select ok(not has_function_privilege('anon', 'public.start_buckets(jsonb)', 'execute'), 'anon cannot execute start_buckets');
select ok(not has_function_privilege('anon', 'public.account_balances(uuid)', 'execute'), 'anon cannot execute account_balances');
select ok(not has_function_privilege('anon', 'public.move_between_buckets(uuid, uuid, bigint)', 'execute'), 'anon cannot execute move_between_buckets');
select ok(has_function_privilege('authenticated', 'public.unsort_start(uuid)', 'execute'), 'authenticated can execute unsort_start');

set local role authenticated;
select pg_temp.as_a();

-- ---------------------------------------------------------------- before: nothing sorted
select is((select count(*)::int from public.account_balances()), 4, 'account_balances: the 4 live PHP accounts (AUD and archived are left out)');
select is((select balance_minor from public.account_balances() where account_id = 'acc-gc'), 1500000::bigint, 'real balance = opening balance (no entries yet)');
select is(pg_temp.hold('acc-gc'), 0::bigint, 'no allocations: GCash should hold 0 by the buckets');
select is(pg_temp.free('acc-gc'), 1500000::bigint, 'GCash: all ₱15,000 is not in a bucket yet');
select is(pg_temp.free('acc-cash'), 300000::bigint, 'Cash keeps no bucket: its ₱3,000 is not in a bucket yet');

-- a real entry moves the balance: inflow +100000 and outflow -40000 on Cash, then they are undone by deletion
insert into public.ledger_entries (id, user_id, "accountId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('x-in',  'aaaaaaaa-0000-0000-0000-000000000001', 'acc-cash', 100000, 0, 3, public.now_ms(), 1, 1, 2),
  ('x-out', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-cash',  40000, 1, 0, public.now_ms(), 1, 1, 2);
select is(pg_temp.free('acc-cash'), 360000::bigint, 'real balance counts opening + inflow - outflow over live entries');
update public.ledger_entries set "deletedAt" = 1 where id in ('x-in', 'x-out');
select is(pg_temp.free('acc-cash'), 300000::bigint, 'deleted entries drop out');

-- income that landed but has no job yet is "To assign", not starting money
insert into public.ledger_entries (id, user_id, "accountId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('w-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-cash', 50000, 0, 0, public.now_ms(), 1, 1, 2);
select is((select balance_minor from public.account_balances() where account_id = 'acc-cash'), 350000::bigint, 'the waiting income is in the real balance');
select is((select waiting_minor from public.account_balances() where account_id = 'acc-cash'), 50000::bigint, 'and reported as waiting');
select is(pg_temp.free('acc-cash'), 300000::bigint, 'but it is not unbucketed: it needs a job, not a bucket');
update public.ledger_entries set "deletedAt" = 1 where id = 'w-1';

-- ---------------------------------------------------------------- refusals (nothing is written)
select throws_ok($$select public.start_buckets('[]'::jsonb)$$, '22023', 'Nothing to sort.', 'no lines');
select throws_ok($$select public.start_buckets('[{"bucketId":"51000000-0000-0000-0000-000000000001","accountId":"acc-gc","amountMinor":0}]'::jsonb)$$, '22023', 'Amounts must be above zero.', 'zero amount');
select throws_ok($$select public.start_buckets('[{"bucketId":"51000000-0000-0000-0000-000000000001","accountId":"acc-gc","amountMinor":-5}]'::jsonb)$$, '22023', 'Amounts must be above zero.', 'negative amount');
select throws_ok($$select public.start_buckets('[{"bucketId":"51000000-0000-0000-0000-000000000001","accountId":"acc-gc","amountMinor":"x"}]'::jsonb)$$, '22023', null, 'non-numeric amount');
select throws_ok($$select public.start_buckets('[{"bucketId":"51000000-0000-0000-0000-000000000001","accountId":"acc-aud","amountMinor":100}]'::jsonb)$$, 'P0001', 'Only pesos accounts can be sorted into buckets.', 'a foreign-currency account is refused');
select throws_ok($$select public.start_buckets('[{"bucketId":"51000000-0000-0000-0000-000000000001","accountId":"acc-b","amountMinor":100}]'::jsonb)$$, '42501', 'account not found', 'another user''s account is refused');
select throws_ok($$select public.start_buckets('[{"bucketId":"52000000-0000-0000-0000-000000000001","accountId":"acc-gc","amountMinor":100}]'::jsonb)$$, '42501', 'bucket not found', 'another user''s bucket is refused');
select throws_ok($$select public.start_buckets('[{"bucketId":"51000000-0000-0000-0000-000000000007","accountId":"acc-gc","amountMinor":100}]'::jsonb)$$, 'P0001', 'That bucket is archived. Restore it first.', 'an archived bucket is refused');
select throws_ok($$select public.start_buckets('[{"bucketId":"51000000-0000-0000-0000-000000000001","accountId":"acc-gc","amountMinor":1000000},{"bucketId":"51000000-0000-0000-0000-000000000002","accountId":"acc-gc","amountMinor":500001}]'::jsonb)$$,
  'P0001', 'Only 1500000 centavos in that account is not in a bucket yet.', 'over-sorting an account (sum of its lines) is refused with the amount still free');
select is((select count(*)::int from public.bucket_starts), 0, 'refused calls wrote nothing');

-- ---------------------------------------------------------------- the golden sort
-- GCash 15,000: Spending 12,000 + Fun 3,000. MariBank 20,000: Emergency 15,000 + Buffer 2,500 + Goals 2,500.
-- GoTrade 5,000: Investment. Cash 3,000 (keeps no bucket): Spending.
create temp table batch as select public.start_buckets('[
  {"bucketId":"51000000-0000-0000-0000-000000000001","accountId":"acc-gc","amountMinor":1200000},
  {"bucketId":"51000000-0000-0000-0000-000000000002","accountId":"acc-gc","amountMinor":300000},
  {"bucketId":"51000000-0000-0000-0000-000000000003","accountId":"acc-bank","amountMinor":1500000},
  {"bucketId":"51000000-0000-0000-0000-000000000004","accountId":"acc-bank","amountMinor":250000},
  {"bucketId":"51000000-0000-0000-0000-000000000005","accountId":"acc-bank","amountMinor":250000},
  {"bucketId":"51000000-0000-0000-0000-000000000006","accountId":"acc-gt","amountMinor":500000},
  {"bucketId":"51000000-0000-0000-0000-000000000001","accountId":"acc-cash","amountMinor":300000}]'::jsonb) as id;
grant select on batch to authenticated;
select is((select count(*)::int from public.bucket_starts where "batchId" = (select id from batch)), 7, 'seven lines in one batch');
select is(pg_temp.left_of('51000000-0000-0000-0000-000000000001'), 1500000::bigint, 'Spending left = 12,000 (GCash) + 3,000 (Cash)');
select is(pg_temp.left_of('51000000-0000-0000-0000-000000000002'), 300000::bigint, 'Fun left');
select is(pg_temp.left_of('51000000-0000-0000-0000-000000000003'), 1500000::bigint, 'Emergency left');
select is(pg_temp.left_of('51000000-0000-0000-0000-000000000004'), 250000::bigint, 'Buffer left');
select is(pg_temp.left_of('51000000-0000-0000-0000-000000000005'), 250000::bigint, 'Goals left');
select is(pg_temp.left_of('51000000-0000-0000-0000-000000000006'), 500000::bigint, 'Investment left');
select is((select allocated from public.bucket_left() where bucket_id = '51000000-0000-0000-0000-000000000006'), 500000::bigint, 'starts count in "allocated" (so goals progress counts them)');
select is(pg_temp.hold('acc-gc'), 1500000::bigint, 'GCash should hold = its real balance');
select is(pg_temp.hold('acc-bank'), 2000000::bigint, 'MariBank should hold = its real balance');
select is(pg_temp.hold('acc-gt'), 500000::bigint, 'GoTrade should hold = its real balance');
select is(pg_temp.hold('acc-cash'), 300000::bigint, 'Cash (no bucket kept) should hold = its real balance');
select is((select count(*)::int from public.account_balances() where unbucketed_minor <> 0), 0, 'every PHP account now matches: no gaps');
select is((select count(*)::int from public.unsorted_money()), 0, 'nothing is misplaced: every start sits where its bucket is kept (Cash has no other bucket to sort to)');
select throws_ok($$select public.start_buckets('[{"bucketId":"51000000-0000-0000-0000-000000000001","accountId":"acc-gc","amountMinor":1}]'::jsonb)$$,
  'P0001', 'Only 0 centavos in that account is not in a bucket yet.', 'nothing is left to sort, so even one centavo is refused');

-- ---------------------------------------------------------------- the week slip still reconciles
-- A payday after the sort (Spending 40 / Fun 10 / Emergency 30 / Buffer 5 / Goals 5 / Investment 10) and some spending.
insert into public.ledger_entries (id, user_id, "accountId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('inc-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-gc', 1000000, 0, 0, pg_temp.ago(1), 1, 1, 2),
  ('sp-1',  'aaaaaaaa-0000-0000-0000-000000000001', 'acc-gc',   70000, 1, 0, pg_temp.ago(0.5), 1, 1, 2);
update public.income_meta set "sourceId" = 'd1000000-0000-0000-0000-000000000001', job = null where "ledgerEntryId" = 'inc-1';
insert into public.entry_buckets (user_id, "ledgerEntryId", "bucketId", source) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'sp-1', '51000000-0000-0000-0000-000000000001', 'category');
select is((select count(*)::int from public.confirm_incomes(array['inc-1'])), 6, 'payday confirmed into six buckets');
create temp table slip as select * from public.week_slip_figures(pg_temp.ago(3));
grant select on slip to authenticated;
select is((select came_in_week from slip), 5300000::bigint, 'Came in = payday 10,000 + money you already had 43,000 (carried in 0)');
select is((select sources from slip), '[{"name": "Money you already had", "amountMinor": 4300000}, {"name": "Work", "amountMinor": 1000000}]'::jsonb,
  'the sort is its own line, never pay');
select is((select spent_week from slip), 70000::bigint, 'Spent this week');
select is(
  (select s.came_in_week from slip s),
  (select s.spent_week + s.to_assign + (select sum(l.left_minor)::bigint from public.bucket_left() l) from slip s),
  'IDENTITY: Came in = Spent + sum(left) + To assign, with starting money in the books');
-- next week: the same money is carried in, not new
create temp table slip2 as select * from public.week_slip_figures(public.now_ms() + 1000);
grant select on slip2 to authenticated;
select is((select came_in_week - carried_in from slip2), 0::bigint, 'seen from a later week, nothing new came in');
select is(
  (select s.came_in_week from slip2 s),
  (select s.spent_week + s.to_assign + (select sum(l.left_minor)::bigint from public.bucket_left() l) from slip2 s),
  'IDENTITY holds in a later week too (starting money is carried in)');
select is((select allocated_minor from public.week_bucket_flows(pg_temp.ago(3), public.now_ms() + 1000) f where f.bucket_id = '51000000-0000-0000-0000-000000000006'), 600000::bigint,
  'week flows: Investment took in 5,000 (start) + 1,000 (10% of the payday)');

-- ---------------------------------------------------------------- move between buckets
select throws_ok($$select public.move_between_buckets('51000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000003', 5000000)$$,
  'P0001', null, 'a move above what is left is refused');
select throws_ok($$select public.move_between_buckets('51000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002', 100)$$, '22023', null, 'a bucket cannot move to itself');
select throws_ok($$select public.move_between_buckets('51000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000001', 100)$$, 'P0002', null, 'another user''s bucket is not found');
select throws_ok($$select public.move_between_buckets('51000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000007', 100)$$, 'P0001', 'That bucket is archived. Restore it first.', 'an archived target is refused');
select throws_ok($$select public.move_between_buckets('51000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000003', 0)$$, '22023', null, 'zero is refused');
select is((select left_minor from public.bucket_left() where bucket_id = '51000000-0000-0000-0000-000000000002'), 400000::bigint, 'Fun left before the move: 3,000 + 10% of the payday');
select lives_ok($$select public.move_between_buckets('51000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000003', 400000)$$, 'moving exactly what is left is allowed');
select is(pg_temp.left_of('51000000-0000-0000-0000-000000000002'), 0::bigint, 'Fun is empty');
select is((select note from public.bucket_covers order by "createdAt" desc limit 1), 'move', 'the cover is labelled "move"');
select is(pg_temp.hold('acc-gc') + pg_temp.hold('acc-bank'), 4330000::bigint, 'GCash + MariBank by the buckets are unchanged in total by a move (35,000 start + 9,000 payday here - 700 spent)');
select is(
  (select s.came_in_week from public.week_slip_figures(pg_temp.ago(3)) s),
  (select (select spent_week + to_assign from public.week_slip_figures(pg_temp.ago(3))) + (select sum(l.left_minor)::bigint from public.bucket_left() l)),
  'IDENTITY holds after a move (covers net to zero)');
select throws_ok($$select public.move_between_buckets('51000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000003', 1)$$, 'P0001', null, 'an empty bucket cannot give');

-- ---------------------------------------------------------------- undo and remove
select is((select public.unsort_start((select id from batch))), 7, 'Undo soft-deletes the whole batch');
select is((select count(*)::int from public.bucket_starts where "deletedAt" is null), 0, 'no live starts');
select is((select count(*)::int from public.bucket_starts), 7, 'rows stay (soft delete only)');
select is(pg_temp.free('acc-cash'), 300000::bigint, 'the gap is back after Undo');
select ok(pg_temp.left_of('51000000-0000-0000-0000-000000000002') < 0, 'Undo is allowed even when a bucket then needs money (Fun moved its start away): honest, negative left');
select throws_ok($$select public.unsort_start((select id from batch))$$, 'P0002', null, 'undoing twice says so');
create temp table b2 as select public.start_buckets('[
  {"bucketId":"51000000-0000-0000-0000-000000000001","accountId":"acc-bank","amountMinor":100000},
  {"bucketId":"51000000-0000-0000-0000-000000000004","accountId":"acc-bank","amountMinor":50000}]'::jsonb) as id;
grant select on b2 to authenticated;
select is((select count(*)::int from public.unsorted_money() where bucket_id = '51000000-0000-0000-0000-000000000001' and account_id = 'acc-bank' and amount_minor = 100000), 1,
  'a start sitting in an account where its bucket is not kept is "misplaced" (ticket 34 can sort it)');
select is((select count(*)::int from public.unsorted_money() where bucket_id = '51000000-0000-0000-0000-000000000004'), 0, 'a start in the bucket''s own account is not');
select is((select public.sort_money('[{"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000003","account":"acc-bank","amount":100000}]'::jsonb)), 1, 'sort_money relabels it');
select is(pg_temp.free('acc-bank'), (select unbucketed_minor from public.account_balances() where account_id = 'acc-bank'), 'sorting never changes what the account holds by the buckets');
select lives_ok($$select public.remove_start((select id from public.bucket_starts where "batchId" = (select id from b2) and "bucketId" = '51000000-0000-0000-0000-000000000004'))$$, 'remove one start line');
select throws_ok($$select public.remove_start((select id from public.bucket_starts where "batchId" = (select id from b2) and "bucketId" = '51000000-0000-0000-0000-000000000004'))$$, 'P0002', null, 'removing again says so');

-- ---------------------------------------------------------------- RLS
select pg_temp.as_b();
select is((select count(*)::int from public.bucket_starts), 0, 'B cannot read A''s starts');
select throws_ok($$insert into public.bucket_starts (user_id, "bucketId", "accountId", "amountMinor") values ('aaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'acc-gc', 100)$$, '42501', null, 'B cannot write a start for A');
select throws_ok($$select public.unsort_start((select id from b2))$$, 'P0002', null, 'B cannot undo A''s batch');
select throws_ok($$select public.start_buckets('[{"bucketId":"51000000-0000-0000-0000-000000000001","accountId":"acc-b","amountMinor":100}]'::jsonb)$$, '42501', 'bucket not found', 'B cannot sort into A''s bucket');
select is((select count(*)::int from public.account_balances()), 1, 'B sees only B''s accounts');
select lives_ok($$select public.start_buckets('[{"bucketId":"52000000-0000-0000-0000-000000000001","accountId":"acc-b","amountMinor":700000}]'::jsonb)$$, 'B sorts its own money');
select is((select left_minor from public.bucket_left() where bucket_id = '52000000-0000-0000-0000-000000000001'), 700000::bigint, 'B''s bucket holds it');
select pg_temp.as_a();
select is((select count(*)::int from public.bucket_starts where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 0, 'A cannot read B''s starts either');

select * from finish();
rollback;
