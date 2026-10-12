-- Review + close the week (ticket 14): the week slip reconciles (BR 8.3) with spending from a set-aside and a
-- cover, close_week computes its checks server-side and is idempotent, tab_badges, and nudge_plan_percent
-- changes BOTH plans atomically (D-18). Clock-independent: every date is relative to now.
begin;
select plan(69);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus") values
  ('acc-mari', 'aaaaaaaa-0000-0000-0000-000000000001', 'MariBank', 1, 0, 'PHP', 'i', 1, false, 1, 1, 2),
  ('acc-cash', 'aaaaaaaa-0000-0000-0000-000000000001', 'Cash',     0, 0, 'PHP', 'i', 2, false, 1, 1, 2),
  ('acc-b-1',  'bbbbbbbb-0000-0000-0000-000000000002', 'B Bank',   1, 0, 'PHP', 'i', 1, false, 1, 1, 2);

insert into public.buckets (id, user_id, name, "groupKey", hue, "keptInAccountId", planless, "displayOrder") values
  ('b1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Tax',       'set_aside', 'tax',       'acc-mari', false, 1),
  ('b1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Living',    'spend',     'living',    'acc-cash', false, 2),
  ('b1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rent',      'set_aside', 'rent',      'acc-mari', false, 3),
  ('b1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emergency', 'save',      'emergency', 'acc-mari', false, 4),
  ('b1000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fun',       'spend',     'fun',       'acc-cash', false, 7),
  ('b1000000-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', 'Buffer',    'set_aside', 'buffer',    'acc-mari', false, 8),
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Emergency', 'save',      'emergency', 'acc-b-1',  false, 2),
  ('b2000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Living',    'spend',     'living',    'acc-b-1',  false, 1);

insert into public.allocation_plans (id, user_id, key, name) values
  ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'A', 'Plan A'),
  ('a1000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'B', 'Plan B'),
  ('a2000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000002', 'A', 'Plan A');
-- A: living 40 emergency 25 fun 15 tax 10 buffer 10.  B: living 50 emergency 30 fun 10 tax 5 buffer 5.
insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000002', 4000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000004', 2500),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000007', 1500),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000001', 1000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000008', 1000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000002', 5000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000004', 3000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000007', 1000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000001', 500),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000008', 500),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-000000000002', 9000),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-000000000001', 1000);

insert into public.income_sources (id, user_id, name, kind, rule, "landsInAccountId") values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Work', 'salary', 'plan', 'acc-mari'),
  ('d1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Gift', 'gift',   'plan', 'acc-mari'),
  ('d2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Work', 'salary', 'plan', 'acc-b-1');

insert into public.categories (id, user_id, name, icon, color, "categoryType", "isSystem", "displayOrder", "createdAt", "updatedAt", "syncStatus") values
  ('cat-groc', 'aaaaaaaa-0000-0000-0000-000000000001', 'Groceries', 'i', 'c', 1, false, 1, 1, 1, 2),
  ('cat-load', 'aaaaaaaa-0000-0000-0000-000000000001', 'Load',      'i', 'c', 1, false, 2, 1, 1, 2),
  ('cat-bir',  'aaaaaaaa-0000-0000-0000-000000000001', 'BIR',       'i', 'c', 1, false, 3, 1, 1, 2),
  ('cat-fun',  'aaaaaaaa-0000-0000-0000-000000000001', 'Movies',    'i', 'c', 1, false, 4, 1, 1, 2);
insert into public.category_buckets (user_id, "categoryId", "bucketId", source) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cat-groc', 'b1000000-0000-0000-0000-000000000002', 'auto'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cat-load', 'b1000000-0000-0000-0000-000000000002', 'auto'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cat-bir',  'b1000000-0000-0000-0000-000000000001', 'auto'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cat-fun',  'b1000000-0000-0000-0000-000000000007', 'auto');

create function pg_temp.ago(p_days numeric) returns bigint language sql as $$ select public.now_ms() - (p_days * 86400000)::bigint $$;
-- Monday of the current week (calendar, DB zone)
create function pg_temp.mon() returns date language sql as $$ select current_date - ((extract(dow from current_date)::int - 1 + 7) % 7) $$;

insert into public.user_profiles (user_id, "weekStartsOn", "reviewDay") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 1, extract(dow from current_date)::int),
  ('bbbbbbbb-0000-0000-0000-000000000002', 1, 0);

-- incomes: one from before the window (10 days ago), one inside it, one still waiting
insert into public.ledger_entries (id, user_id, "accountId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('inc-before', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-mari', 1000000, 0, 0, pg_temp.ago(10), 1, 1, 2),
  ('inc-week',   'aaaaaaaa-0000-0000-0000-000000000001', 'acc-mari', 2000000, 0, 0, pg_temp.ago(1),  1, 1, 2),
  ('inc-wait',   'aaaaaaaa-0000-0000-0000-000000000001', 'acc-mari',   50000, 0, 0, pg_temp.ago(0),  1, 1, 2),
  ('inc-b',      'bbbbbbbb-0000-0000-0000-000000000002', 'acc-b-1',   100000, 0, 0, pg_temp.ago(1),  1, 1, 2);
insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-before', 'd1000000-0000-0000-0000-000000000001', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-week',   'd1000000-0000-0000-0000-000000000001', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-wait',   'd1000000-0000-0000-0000-000000000002', null),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'inc-b',      'd2000000-0000-0000-0000-000000000001', null);

create function pg_temp.as_a() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true) $$;
create function pg_temp.as_b() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true) $$;

select ok(not has_function_privilege('anon', 'public.close_week(date, text)', 'execute'), 'anon cannot execute close_week');
select ok(not has_function_privilege('anon', 'public.nudge_plan_percent(uuid, uuid, integer)', 'execute'), 'anon cannot execute nudge_plan_percent');
select ok(not has_function_privilege('anon', 'public.week_slip_figures(bigint)', 'execute'), 'anon cannot execute week_slip_figures');
select ok(not has_function_privilege('anon', 'public.tab_badges(date)', 'execute'), 'anon cannot execute tab_badges');
select ok(has_function_privilege('authenticated', 'public.close_week(date, text)', 'execute'), 'authenticated can execute close_week');

set local role authenticated;
select pg_temp.as_a();

-- ---------------------------------------------------------------- the slip reconciles
select is((select count(*)::int from public.confirm_incomes(array['inc-before', 'inc-week'])), 10, 'both paydays confirmed (5 buckets each)');
-- spending: before the window (Fun 10000), Living 1,300,000 this week (overspent), BIR 30000 paid FROM TAX this week
insert into public.ledger_entries (id, user_id, "accountId", "categoryId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus")
select v.id, auth.uid(), 'acc-cash', v.c, v.a, 1, 0, pg_temp.ago(v.d), 1, 1, 2
  from (values ('sp-old', 'cat-fun', 10000, 9), ('sp-groc', 'cat-groc', 1000000, 2), ('sp-load', 'cat-load', 300000, 1), ('sp-bir', 'cat-bir', 30000, 1)) v(id, c, a, d);
select is((select count(*)::int from public.entry_buckets), 4, 'each spending entry got its bucket (trigger)');
select lives_ok($$select public.cover_bucket('b1000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000002', 50000)$$, 'cover Living 50000 from Buffer');

create function pg_temp.left_of(p_hue text) returns bigint language sql as $$
  select l.left_minor from public.bucket_left() l join public.buckets b on b.id = l.bucket_id where b.hue = p_hue $$;
select is(pg_temp.left_of('living'), -50000::bigint, 'Living: 1,200,000 allocated - 1,300,000 spent + 50,000 cover = -50,000 (Needs 500.00)');
select is(pg_temp.left_of('tax'), 270000::bigint, 'Tax: 300,000 set aside - 30,000 BIR payment = 270,000 left');
select is(pg_temp.left_of('buffer'), 250000::bigint, 'Buffer: 300,000 - 50,000 cover out = 250,000 left');

-- the window is "this week as of now": a fixed 3-days-ago start gives exact figures
create temp table slip as select * from public.week_slip_figures(pg_temp.ago(3));
grant select on slip to authenticated;
select is((select came_in_week from slip), 3040000::bigint, 'Came in = this week 2,000,000 + waiting 50,000 + carried 990,000');
select is((select carried_in from slip), 990000::bigint, 'carried in from before the week (1,000,000 - 10,000 spent before)');
select is((select spent_week from slip), 1330000::bigint, 'Spent this week = 1,300,000 Living + 30,000 BIR (from Tax)');
select is((select to_assign from slip), 50000::bigint, 'To assign = the waiting 50,000');
select ok((select has_history from slip), 'there is history before this week');
select is((select sources from slip), '[{"name": "Work", "amountMinor": 2000000}, {"name": "Gift", "amountMinor": 50000}]'::jsonb, 'one line per source (this week only)');
select is(
  (select s.came_in_week from slip s),
  (select s.spent_week + s.to_assign + (select sum(l.left_minor)::bigint from public.bucket_left() l) from slip s),
  'IDENTITY: Came in = Spent + sum(left) + To assign, with a payment from Tax and a cover in the books');
select is(
  (select sum(l.left_minor)::bigint from public.bucket_left() l join public.buckets b on b.id = l.bucket_id where b."groupKey" = 'spend'),
  390000::bigint, 'Safe to spend = Living -50,000 + Fun 440,000');

select is((select count(*)::int from public.week_slip_figures(pg_temp.ago(0.0001))), 1, 'a window starting just now still returns one row');
select is((select spent_week from public.week_slip_figures(pg_temp.ago(0.0001))), 0::bigint, 'nothing spent after that point');
select is((select has_history from public.week_slip_figures(pg_temp.ago(30))), false, 'a window before any income has no history (first week)');

-- ---------------------------------------------------------------- flows and categories
select is((select spent_minor from public.week_bucket_flows(pg_temp.ago(3), pg_temp.ago(-1)) f join public.buckets b on b.id = f.bucket_id where b.hue = 'living'), 1300000::bigint, 'flows: Living spent this week');
select is((select covers_in_minor from public.week_bucket_flows(pg_temp.ago(3), pg_temp.ago(-1)) f join public.buckets b on b.id = f.bucket_id where b.hue = 'living'), 50000::bigint, 'flows: Living covered this week');
select is((select change_minor from public.week_bucket_flows(pg_temp.ago(3), pg_temp.ago(-1)) f join public.buckets b on b.id = f.bucket_id where b.hue = 'emergency'), 750000::bigint, 'flows: Emergency changed by its 25% of both paydays (both confirmed now)');
select is((select spent_minor from public.week_bucket_flows(pg_temp.ago(30), pg_temp.ago(20)) f join public.buckets b on b.id = f.bucket_id where b.hue = 'living'), 0::bigint, 'flows: an old window is empty');
select is((select category_name || ':' || amount_minor from public.week_category_spend(pg_temp.ago(3), pg_temp.ago(-1)) c join public.buckets b on b.id = c.bucket_id where b.hue = 'living' limit 1), 'Groceries:1000000', 'biggest Living category this week is Groceries');
select is((select count(*)::int from public.week_category_spend(pg_temp.ago(3), pg_temp.ago(-1))), 3, 'three bucket x category rows this week');

-- ---------------------------------------------------------------- tab badges
select is((select waiting_count from public.tab_badges(current_date)), 1, 'tab badge: one income waiting');
select is((select review_due from public.tab_badges(current_date)), true, 'Review is due on the review day when the week is open');
select is((select review_due from public.tab_badges(current_date + 1)), false, 'not due on another day');

-- ---------------------------------------------------------------- close_week
select throws_ok($$select * from public.close_week(pg_temp.mon() + 14)$$, '22023', 'That week has not started yet.', 'a future week cannot be closed');
select throws_ok($$select * from public.close_week(pg_temp.mon() + 1)$$, '22023', 'That date is not the first day of your week.', 'a date that is not a week start is refused');
select throws_ok($$select * from public.close_week(pg_temp.mon(), repeat('x', 401))$$, '22023', 'observation is too long', 'an overlong observation is refused');
select is((select count(*)::int from public.week_reviews), 0, 'nothing stored by the refused calls');

select is((select check_results from public.close_week(pg_temp.mon(), 'Living ran short.')), '{"assign": false, "living": false, "transfers": false}'::jsonb, 'checks are computed by the server: income waits, Living is below zero, so all three are open');
select is((select count(*)::int from public.week_reviews), 1, 'a week_reviews row is stored');
select is((select "safeToSpendMinor" from public.week_reviews), 390000::bigint, 'safe to spend stored');
select is((select observation from public.week_reviews), 'Living ran short.', 'observation stored');
select is((select was_already_closed from public.close_week(pg_temp.mon())), true, 'closing again is harmless: returns the stored week');
select is((select count(*)::int from public.week_reviews), 1, 'still one row');
select is((select check_results from public.close_week(pg_temp.mon())), '{"assign": false, "living": false, "transfers": false}'::jsonb, 'the second call returns the stored checks, not new ones');
select is((select review_due from public.tab_badges(current_date)), false, 'the Review dot clears once the week is closed');
select is((select count(*)::int from public.week_reviews where "closedAt" > 0 and "weekStart" = pg_temp.mon()), 1, 'closedAt is set');

-- ---------------------------------------------------------------- cross-user
select pg_temp.as_b();
select is((select came_in_week from public.week_slip_figures(pg_temp.ago(3))), 100000::bigint, 'B''s slip counts only B''s income');
select is((select count(*)::int from public.week_reviews), 0, 'B cannot see A''s week review');
select is((select count(*)::int from public.confirm_incomes(array['inc-b'])), 2, 'B confirms the only payday (Living 90%, Emergency 10%)');
select is((select check_results from public.close_week(pg_temp.mon())), '{"assign": true, "living": true, "transfers": true}'::jsonb, 'B: everything has a job, nothing to send, Living above zero: all checks pass');
select is((select count(*)::int from public.week_reviews), 1, 'B has her own row');
select throws_ok($$select * from public.nudge_plan_percent('b1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000002', 100)$$, '42501', null, 'B cannot nudge using A''s bucket ids');
select is((select count(*)::int from public.engine_waiting_income(auth.uid())), 0, 'B has nothing waiting');

-- ---------------------------------------------------------------- nudge_plan_percent (both plans)
select pg_temp.as_a();
create temp table before_alloc as select md5(coalesce(string_agg(a::text, '|' order by a.id), '')) as h from public.allocations a;
grant select on before_alloc to authenticated;
create function pg_temp.pcts(p_key text) returns text language sql as $$
  select string_agg(b.hue || '=' || l."percentBp", ',' order by b."displayOrder")
    from public.allocation_plan_lines l join public.allocation_plans p on p.id = l."planId"
    join public.buckets b on b.id = l."bucketId"
   where p.key = p_key and l."deletedAt" is null and p.user_id = auth.uid() $$;
create function pg_temp.total(p_key text) returns bigint language sql as $$
  select sum(l."percentBp") from public.allocation_plan_lines l join public.allocation_plans p on p.id = l."planId"
   where p.key = p_key and l."deletedAt" is null and p.user_id = auth.uid() $$;

select is((select count(*)::int from public.nudge_plan_percent('b1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000002', 100)), 2, 'the nudge reports both plans');
select is(pg_temp.pcts('A'), 'tax=1000,living=4100,emergency=2500,fun=1400,buffer=1000', 'Plan A: Living +1, Fun -1');
select is(pg_temp.pcts('B'), 'tax=500,living=5100,emergency=3000,fun=900,buffer=500', 'Plan B changed too (D-18)');
select ok(pg_temp.total('A') = 10000 and pg_temp.total('B') = 10000, 'both plans still total 10000 bp');
select is((select string_agg(plan_key || ':' || to_bp, ',' order by plan_key) from public.nudge_plan_percent('b1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000003', 100)), 'A:100,B:100', 'moving into a bucket with no line adds one (Rent) in both plans');
select is(pg_temp.pcts('A'), 'tax=1000,living=4100,rent=100,emergency=2500,fun=1300,buffer=1000', 'Plan A got the Rent line');
select ok(pg_temp.total('A') = 10000 and pg_temp.total('B') = 10000, 'still 10000 after adding a line');

select is((select string_agg(plan_key, ',') from public.nudge_plan_percent('b1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000002', 900)), 'A',
  'only plans where Fun has the 9% move (P-9): Plan B (8%) is left alone');
select is(pg_temp.pcts('A'), 'tax=1000,living=5000,rent=100,emergency=2500,fun=400,buffer=1000', 'Plan A moved');
select is(pg_temp.pcts('B'), 'tax=500,living=5100,rent=100,emergency=3000,fun=800,buffer=500', 'Plan B is untouched');
select is((select string_agg(plan_key, ',') from public.nudge_plan_percent('b1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000002', 800)), 'B', 'moving what only Plan B has changes only Plan B');
select is(pg_temp.pcts('B'), 'tax=500,living=5900,rent=100,emergency=3000,fun=0,buffer=500', 'Plan B Fun is 0');
select lives_ok($$select * from public.nudge_plan_percent('b1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000002', 400)$$, 'Plan A gives its last 4%');
select throws_ok($$select * from public.nudge_plan_percent('b1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000002', 100)$$, '22023',
  'Fun has less than 1% in every plan, so 1% can''t move to Living. Change the split in Plans instead.', 'refused, naming the buckets, when no plan has enough');
select ok(pg_temp.total('A') = 10000 and pg_temp.total('B') = 10000, 'both plans still total 10000 bp after every nudge');
select throws_ok($$select * from public.nudge_plan_percent('b1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000007', 100)$$, '22023', null, 'same bucket twice is refused');
select throws_ok($$select * from public.nudge_plan_percent('b1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000002', 0)$$, '22023', null, 'zero is refused');
select is((select md5(coalesce(string_agg(a::text, '|' order by a.id), '')) from public.allocations a), (select h from before_alloc), 'confirmed allocations are untouched by plan nudges (future paydays only)');

select * from finish();
rollback;
